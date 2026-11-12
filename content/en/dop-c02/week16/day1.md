# Day 1 - Domain 1+2 Integrated Review: SDLC Automation and IaC as One Thread

Sixteen weeks of study reach their cap. Yesterday's synthesis taught: don't fragment. Code's journey from commit to production is **one thread**, not silos. Domain 1 (SDLC, 22%) and Domain 2 (IaC + config, 17%) together are 39% of the exam — largest. Split in the blueprint but inseparable in practice. Pipeline deploys infrastructure; infrastructure defines pipeline; configuration flows between. Today we rethread as "code → production" single flow, with history, theory, and real-world failure lessons woven through each joint.

This unity matters because Pro's traps live at **domain crossings.** "CodePipeline cross-account CloudFormation deploy, KMS error" isn't just a pipeline problem — it's pipeline + IaC + security all tangled. Know each service alone, miss this knot.

## SDLC Automation Genealogy — Why Code* Split This Way

AWS's developer tools — CodeCommit, CodeBuild, CodeDeploy, CodePipeline — four separate products. Not arbitrary. This split **mirrors Continuous Delivery's canonical stage model.** Source → Build → Test → Deploy, codified by Jez Humble and David Farley (2010 *Continuous Delivery* book). AWS's Code* suite is that model as managed services.

> 💡 **Related theory**: Pipeline stage-splitting is CS's **pipelining** principle applied to software delivery. CPU pipeline: fetch-decode-execute-writeback stages, each occupied by different instructions in parallel. CI/CD: separate stages so Commit A deploys while Commit B tests (theory). Deeper: **separation of concerns.** Build (compile, test, artifact) ≠ Deploy (traffic shift, rollback). Split them, and each scales independently, restarts alone, swaps implementations (Jenkins → CodePipeline, CodeDeploy → Spinnaker, endpoint unchanged). This decoupling is why "Stage fails" doesn't cascade; earlier stages' artifacts persist.

> 🔍 **Deeper**: CodePipeline has **V1 and V2**, a generational gap the exam loves. V1 (2015 debut): simple triggers (source change = run all stages), no pipeline variables. V2 (2023): **dynamic variables**, **fine-grained triggers** (filePaths, branches, tags filters), **execution modes** (QUEUED·SUPERSEDED·PARALLEL for concurrent commits). Example: "monorepo, `services/payments/**` change only triggers payments pipeline" — V2's `filePaths` trigger alone. V1 has no path filter; you hand-build that in Lambda. Also: V2 billed by action-minutes, V1 by active pipeline/month; dead pipelines cheaper on V2. Exam: "monorepo path filter" or "dynamic variable" → V2 always.

Hidden gotcha: **CodeCommit deprecated for new signups (2024).** AWS shifted focus to GitHub/GitLab integration (CodeConnections, formerly CodeStar Connections). Latest exam scenarios favor "GitHub Actions + OIDC AssumeRole AWS" patterns over CodeCommit. Check CodeCommit answers carefully — they're aging.

## Deployment Strategy Mathematics — Balancing Risk, Time, Infrastructure

Deployment strategy is DOP's heart. Not just "no downtime vs downtime" but deep: which strategy minimizes **"bad-deployment impact × exposure time."**

| Strategy | Impact if bad | Extra infra | Rollback speed | Core Mechanism |
|---|---|---|---|---|
| All-at-once / In-place | 100% instant | 0 | Slow (redeploy) | Swap all simultaneously |
| Rolling | Batch%, rising | 0 | Medium | N at a time, sequential |
| Blue/Green | 0% before flip / 100% after | 2x temp | Instant (flip back) | Parallel environments + routing switch |
| Canary | Canary% (e.g., 10%) | Small | Auto (alarm) | Minority → majority two-stage |
| Linear | Increment each interval | Small | Auto (alarm) | N% each N min, smooth curve |

> 💡 **Related theory**: Canary (small group, watch metrics, then ramp) is **sequential hypothesis testing.** "New version is good" — test on 10%, alarm catches bad metrics, fail fast before 100% affected. Mathematically: **expected loss = bad-deploy impact × exposure fraction × time.** Canary 10% for 5min = "worst case, 10% × 5min loss." Blue/Green: "0% loss before flip, instant rollback after"; risk is concentrated at flip moment. Rolling: gradual exposure, medium rollback (reroll old version, slower). Trade-off: Canary+Linear cheap on infra, Blue/Green costs 2x but fastest rollback.

> 🔍 **Deeper**: Blue/Green mechanics differ wildly by platform. **Lambda**: Alias + weighted routing (90%→v1, 10%→v2, CodeDeploy shifts). **ECS**: CodeDeploy creates new Task Set, ALB Listener test-routes it, then prods shift Listener to new Target Group (two TGs, two Listeners). **EC2**: new ASG spins, ELB registration swaps. Exam: "ECS Blue/Green" → almost always "CodeDeploy + ALB Test/Prod Listener". Mixing up platform mechanics loses points.

> 📚 **Case study**: 2017 **TSB Bank** IT migration failure: new core platform, one big-bang cutover, 1.9M customers exposed simultaneously to untested system. Result: weeks of downtime, money access blocked, ~£330M loss + regulatory fine. Teaching: canary/phased prevents blast radius. If TSB had 1% canary + alarm rollback, damage is capped to 1% × hours, not 100%.

## IaC Philosophy — Declarative Convergence Replaces Imperative Procedure

Crossing into Domain 2: **infrastructure code's essence is "declare goal state, system converges."**

> 💡 **Related theory**: Declarative IaC's core is **reconciliation loop** (control theory's feedback: goal vs observed, compute error, apply actions, loop). Terraform `plan/apply`, CloudFormation `update`, Kubernetes `apply`—all reconcile desired→observed. **Declarative vs imperative**: imperative ("run these commands in order") leaves drift, retry, order to humans. Declarative ("this should be true") is **idempotent** — apply same code 100x, end state same (each account, 100 times, = identical state).

> 🔍 **Deeper**: **Drift** is this paradigm's hidden enemy. Someone edits security group in console; "code says X, reality says Y." CloudFormation **Drift Detection** surfaces this. Fixing: EventBridge scheduled rule runs Drift Detection; results → SNS alert or auto-update stack. Harsh truth: detect/remediate drift is management burden. Pro fix: lock the console, all changes via code/pipeline. No console write unless explicit Pipeline role allowed.

> 📚 **Case study**: 2017 **AWS S3 us-east-1 outage**, engineer ran wrong manual command, deleted more servers than intended, cascading failures. Lesson: manual operations are fast-to-fail and hard-to-rollback. IaC + pipeline means changes are audited (Git PR), reviewable (Change Set), auto-rollback (Alarm). Undoes manual's risk.

## Config Separation — Parameter Store vs Secrets Manager vs AppConfig

Between code and infrastructure flows **configuration**. AWS splits it three ways; each answers different needs.

| Item | Parameter Store | Secrets Manager | AppConfig |
|---|---|---|---|
| Essence | Config storage | Secret lifecycle | Runtime behavior |
| Auto rotate | No | Yes (Rotation Lambda) | No |
| Validate | No | No | Yes (JSON Schema/Lambda) |
| Gradual deploy | No | No | Yes (Deployment Strategy) |
| Cost | Free (mostly) | ~$0.40/secret/month | Per-fetch |
| Use | Non-secret env, DB host | DB/API cred, PKI | Feature flags, thresholds |

> 💡 **Related theory**: This split is **12-Factor App** refined. "Config not code" says twelve-factor; modern systems refine "config" into three: (1) static (rarely changes, non-secret) → Parameter Store, (2) secret (rotate, audit) → Secrets Manager, (3) **dynamic control** (changes at runtime, wrong value = immediate risk) → AppConfig. AppConfig unique: validates (bad JSON = reject pre-deploy), stages roll-out (80% before 100%), auto-rollback on alarm. "Wrong feature flag value" treated like "bad deployment," not just "config tweak."

> ⚠️ **Gotcha**: **AppConfig is polling (pull) not push.** Apps poll via Agent/Extension, get config on interval. "Change config, app updates instantly" is wrong; delay = polling interval. Also, Parameter Store SecureString does KMS encrypt but **no auto-rotate** — rotate manually or use Lambda. "DB cred rotate 90 days" → Secrets Manager + Rotation Lambda, not Parameter Store.

> 📚 **Case study**: Observability cost explosion (2019+). SaaS firms logged everything, shipped to centralized observability SaaS, costs spiraled. This forced **config-as-deployment** thinking: "feature flag gates expensive trace sampling", "bad config kills costs." AppConfig's staged roll-out + alarm + rollback became the guard rail.

## Unified Flow Diagram

```
Developer commit (GitHub / CodeCommit-legacy)
   │  CodeConnections (OIDC, no static key)
   ▼
CodePipeline V2 (Tooling account Hub)
   ├─ Source   : Variables + Triggers (filePaths·branch filter)
   ├─ Build    : CodeBuild (isolated VPC + VPC Endpoint)
   │              → CodeArtifact(packages) / ECR (images)
   │              → Inspector scan + Signer/Notation sign [supply-chain integrity]
   ├─ Test     : Unit/Integration + CodeGuru/SAST
   ├─ Deploy   : CloudFormation/CDK (Change Set preview)
   │              cross-account AssumeRole → Spoke
   │              [S3 artifact + KMS CMK key policy must allow Spoke decryption]
   │              CodeDeploy (Lambda Canary / ECS Blue-Green)
   │              + CloudWatch Alarm auto-rollback
   └─ Config   : Parameter Store (config) / Secrets Manager (cred) / AppConfig (flag)

Governance gates: SSM Change Calendar (freeze) · Manual Approval · Drift Detection (EventBridge)
```

> 🎯 **Scenario**: "Fintech, monorepo, 30 services. ① `services/X/**` change only triggers X pipeline ② artifact sign + SBOM scan ③ Lambda 10% canary 5min ④ DB cred 90d auto-rotate ⑤ prod freeze-window block." → ① **V2 filePaths trigger**. ② **Signer/ECR Image Signing + Inspector** (not KMS). ③ **`Canary10Percent5Minutes`** + CloudWatch Alarm rollback. ④ **Secrets Manager + Rotation Lambda**. ⑤ **SSM Change Calendar** gate. Five signals, each a domain 1 or 2 action. Cross-domain thread: pipeline carries config; config gates behavior; code assumes config present.

## Summary

Today wove Domain 1+2's 39% back together. First, **Code* split reflects Continuous Delivery's canonical pipeline stages**, V2 adds variables/fine-grain triggers/execution modes. Second, **deployment strategy is math minimizing (bad-deploy impact × exposure time)**, Canary 2-stage vs Linear smooth, platform mechanics differ (Lambda Alias, ECS ALB Listener, EC2 ASG). Third, **IaC is declarative reconciliation + idempotency**, drift detection + auto-remediate, manual operations are risk. Fourth, **config splits into three: Parameter Store (static), Secrets Manager (rotate), AppConfig (validate·stage·rollback)**, each for different change cadence. Fifth, **unified flow: commit → pipeline stages (build, test, deploy with gates) → infrastructure + config injection**, with security (signing), resilience (canary), governance (freeze calendar) woven through.

Next: Domain 3+4 review: resilience (RTO/RPO math, DR strategies, FIS chaos) and monitoring (observability trio, log tiers, multi-account Sink/Link).

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
