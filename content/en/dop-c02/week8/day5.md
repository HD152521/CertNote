# Day 5 - Week 8 Integrated Scenarios: Where IaC Tools Meet Inside a Single Incident

Going through Week 8, we looked at seven tools: CloudFormation's Nested/Cross-Stack, Service-managed StackSets, the Custom Resource ResponseURL protocol, Hooks' pre-deployment validation, the CDK's Construct Levels and Pipelines self-mutation, and Terraform tfstate locking. The hard questions on the exam do not feature these tools separately. **Three or four of them are tangled together in one scenario, and the question asks "where, and with which tool, should this be solved?"** Today we build that integrated sense.

Before solving the questions, let's organize once more. IaC tools are distinguished along three axes: **abstraction layer**, **governance scope**, and **change timing**. Abstraction rises from CFN (YAML) → SAM (macro) → CDK (code); governance expands from a single stack → multiple stacks in a single account → multi-account (StackSets/Pipelines); and change timing has four stages: synthesis time (Aspects/cdk-nag) → before deployment (Hooks) → during deployment (ChangeSet) → after deployment (Drift/Config). Exam scenarios ask where on these three axes the answer lies.

## Integrated Comparison Table — All Week 8 Tools

| Tool | Abstraction | Governance | Change timing | One-line summary |
|------|--------|----------|-----------|------------|
| **CloudFormation** | Declarative YAML | Per stack | At deployment | The foundation engine, 13 years of accumulated governance assets |
| **SAM** | CFN macro + serverless DSL | Stack | Synthesis → deployment | Condenses serverless boilerplate |
| **CDK** | Code (TS/Py/Java) | Stack | Synthesis → deployment | The LLVM IR pattern, code reusability |
| **CDK Pipelines** | Code | Multi-environment | Self-mutating CI | The pipeline is code too, the GitOps principle |
| **StackSets** | CFN synchronization | Multi-account, multi-Region | OU-level fan-out | The single source of truth for 1000+ accounts |
| **Custom Resource** | Lambda Provider | Extension inside a stack | Invoked during deployment | Extends CFN as a lifecycle engine |
| **CFN Hooks** | Resource Type Provider | Stack or Org | Pre-blocks changes | The K8s ValidatingAdmissionWebhook pattern |
| **CFN Drift** | Detection mechanism | Stack/StackSet | Post-deployment comparison | Detection only, no automatic fix |
| **Change Set** | Change preview | Stack | Review before deployment | Replacement=True is the danger signal |
| **Terraform** | HCL | Per tfstate | plan → apply | Multi-cloud, self-managed tfstate |
| **CDKTF** | Code → HCL | tfstate | Synthesis | CDK constructs + Terraform Providers |

Keep this table in mind as you look at the scenarios. Each scenario is built to resemble a real operational situation a company has faced, and the options other than the correct answer are partly correct as well, so you must pick "the most appropriate."

---

## 📝 Practice Questions

**Question 1.** A fintech wants to deploy the same GuardDuty/CloudTrail/Config baseline to 200 child accounts in an AWS Organizations environment, and the same baseline must be applied automatically to new accounts added every week. The security team also requires minimizing day-to-day use of the Management Account. What is the most appropriate configuration?

A) Deploy with Self-managed StackSets, with an operator manually adding the account ID and a pre-created IAM execution role for each new account — impractical with 200 accounts plus new ones every week, and it does not reduce Management Account usage
B) Trigger a Lambda from the EventBridge account-creation event to apply the baseline to each account with boto3 — idempotency, failure retries, concurrency limits, and rollback must all be implemented by hand
C) Register the Tooling account as Delegated Administrator + Service-managed StackSets + AutoDeployment Enabled, targeting OUs
D) Have operators configure GuardDuty, CloudTrail, and Config directly in every account over SSH/console — manual operation that gives up infrastructure automation, impossible at 200-account scale

**Answer: C**

Explanation: The three requirements each point to a different tool. (1) Automatic application to 200 accounts = Service-managed (Self-managed's chicken-and-egg problem), (2) automatic for new accounts = AutoDeployment Enabled, (3) protecting the Management Account = delegating to a Delegated Administrator. The combination satisfying all three is C. Self-managed (A) needs pre-created IAM and is impractical for 200 accounts, direct Lambda invocation (B) burdens you with implementing idempotency, failure handling, and concurrency policy yourself, and D ignores infrastructure automation. On the exam, when the keywords "OU-level + automatic" appear together, the answer is almost always Service-managed + AutoDeployment.

---

**Question 2.** A SaaS company deployed an RDS DBInstance change to a prod CloudFormation Stack, and the database was unintentionally replaced, causing 6 hours of downtime. To strengthen the standard change procedure so the same incident does not recur, what is the most appropriate combination?

A) Deploy identically to all environments with the single line `aws cloudformation deploy` — the replacement executes as is, with no chance for a human to review the Change Set's Replacement=True information
B) A 3-step CodePipeline of CreateChangeSet → ManualApproval (forcing review of the Change Set's Replacement information) → ExecuteChangeSet + DeletionPolicy=Snapshot/UpdateReplacePolicy=Snapshot on prod RDS + a Stack Policy denying Replace/Delete
B-alt) Add only the `--require-approval=any-change` option — it merely adds a confirmation on every change, with no data backup (UpdateReplacePolicy) on RDS replacement and no Replace blocking (Stack Policy), so it is a single line of defense
C) Only tighten the deployment IAM permissions to restrict RDS change permissions — IAM controls only who can make changes and cannot prevent the replacement risk of a legitimate change that passes through CFN
D) Add only Drift Detection automation — it is a post-deployment comparison, so it detects things only after the replacement and downtime have already occurred

**Answer: B**

Explanation: The root cause of the incident was three overlapping flaws: (1) deploying directly without a Change Set review, (2) UpdateReplacePolicy not set, and (3) no Stack Policy. With only one line of defense, the same incident recurs. With defense in depth: (1) Change Set + Manual Approval forces human review (a SOC 2/PCI governance requirement), (2) UpdateReplacePolicy=Snapshot backs up data on replacement, and (3) the Stack Policy blocks Replace/Delete itself. `aws cloudformation deploy` (A) does not show the Change Set information, IAM (C) is weak against changes that pass through CFN, and Drift (D) is post-hoc detection, after the incident.

---

**Question 3.** In a CloudFormation environment run by a game company, the network Stack's `VpcId` Export is used as an ImportValue by 50 other Stacks. When they tried to update the network Stack to expand the VPC, the entire deployment stopped with a "Cannot update Export" error. Which answer satisfies both an immediate fix and long-term improvement?

A) Immediately delete and recreate the network Stack — the moment the VpcId Export disappears, the 50 dependent Stacks tied by ImportValue break simultaneously, and deleting the VPC halts all workloads
B) Immediate: remove ImportValue from the 50 dependent Stacks temporarily → update the network Stack → re-add ImportValue to the dependent Stacks, in a 3-step deployment. Long term: migrate to SSM Parameter Store + dynamic references (`{{resolve:ssm:/network/vpc-id:1}}`) instead of Cross-Stack Exports
C) Merge the 51 Stacks into one Nested Stack tree — the Export lock disappears but everything becomes tightly coupled, and the blast radius of a small change grows to all 50 Stacks
D) Migrate everything to Terraform — it avoids the lock through tfstate references, but the migration cost is large and it does not immediately lift the current "Cannot update Export" block

**Answer: B**

Explanation: An Export is locked while in use (the same pattern as the 2022 incident where a game company's prod deployment was paralyzed for 12 hours). For the immediate fix there is no method other than the 3-step deployment, since removing ImportValue on the dependent side is the condition for releasing the lock. For the long term, preventing recurrence means moving to Parameter Store, as AWS Best Practices recommend. A dynamic reference with an explicit version controls the impact of unintended changes. Deleting and recreating the Stack (A) breaks all 50 dependent Stacks too, Nested consolidation (C) tightly couples all 50 Stacks and enlarges the blast radius, and Terraform (D) is costly without solving the essence.

---

**Question 4.** A company wants to codify a newly released AWS Bedrock model in CloudFormation but found that some deep features are not yet supported by CFN. They plan to handle only that part with a Custom Resource Lambda. What is the most important design element for operational stability?

A) Allocate generous Lambda memory — it affects processing speed but has nothing to do with the core risk that if the ResponseURL response is missing, the Stack is stuck for up to 3 days
B) The Lambda must PUT a response to the ResponseURL in every branch (Create/Update/Delete + exceptions), keep the PhysicalResourceId identity key stable (returning a new ID on Update triggers automatic resource replacement), and for long-running work use the CDK Provider framework's isComplete pattern with Step Functions polling
C) Optimize Lambda invocation cost — merely a side cost item, not an operational stability factor like the Custom Resource's response protocol or PhysicalResourceId stability
D) Choose the deployment Region of the Provider Lambda — only a factor deciding resource location, with no direct relation to the failure modes where CFN halts the Stack or replaces resources

**Answer: B**

Explanation: Three core pitfalls of operating Custom Resources. (1) If the response is missing, CFN waits 1 hour (up to 3 days) and the Stack is stuck, (2) a changed PhysicalResourceId triggers automatic resource replacement (the pattern of the 2020 fintech payment API key incident), (3) CDK Provider's isComplete is used to work around Lambda's 15-minute limit. All three come up repeatedly on the exam and in practice. AWS recommends using the `cfn-response` Python module and the CDK Provider, whose boilerplate abstracts the three pitfalls above. Custom Resources that fill the CFN lag for newly launched services are a common pattern, so operational stability is itself the measure of the company's credibility.

---

**Question 5.** A SaaS deploys the same pattern (Lambda + DynamoDB + API Gateway + X-Ray + CloudWatch Alarm) to 200 microservices with the CDK. The security team wants to apply a new policy ("all Lambdas must have reserved concurrency of 100 or less, and all DynamoDB tables must have point-in-time recovery enabled"). How can you enforce it consistently without modifying the code of the 200 services?

A) Manually modify the code of the 200 services team by team to add reserved concurrency and PITR — consistency depends on people, omissions and drift are inevitable, and every policy change means repeating the edit in 200 places
B) Build your own L3 Construct (`StandardLambdaApiPattern`) that every service uses and apply policy changes in that one Construct place + simultaneously validate the whole tree with CDK Aspects (`Annotations.addError`) + block at synthesis time with a cdk-nag rule set + block at deployment time with CFN Hooks, a multi-layered defense
C) Enforce with IAM policies — IAM controls only who calls what and cannot enforce resource property configurations such as reserved concurrency values or DynamoDB PITR
D) Simply register as an approved product in Service Catalog — it is only a self-service provisioning catalog and cannot retroactively enforce policy on the 200 services that already exist

**Answer: B**

Explanation: Multi-layered defense in governance: (1) concentrate the policy in one place in code with your own L3 Construct, (2) block violations at synthesis (synth) time with Aspects/cdk-nag, giving early feedback in the CI pipeline, (3) pre-block changes at deployment time with Hooks, which also stops changes that bypass the policy. A single layer can be bypassed (for example, using L2 directly without the L3 → Aspects catches it). IAM (C) is irrelevant, and Service Catalog (D) is self-service registration, not policy enforcement. It is the same pattern as K8s OPA Gatekeeper admission control + Helm chart standardization.

---

**Question 6.** A game company deploys to three environments, Dev/Staging/Prod, with CDK Pipelines, but after adding the Prod account the build fails with a "KMS access denied" error. The Pipeline is in the Tooling account and Prod is a separate account. What is the most accurate cause and fix?

A) Insufficient IAM permissions on the build-stage Lambda — the error being specifically "KMS access denied" and occurring right after adding the Prod account points to a cross-account key sharing problem, not Lambda permissions
B) `crossAccountKeys: true` is not set — the CodePipeline artifact S3 objects are encrypted with an AWS managed KMS key, so the other account's cfn-exec-role cannot decrypt them. Enabling `crossAccountKeys: true` in the CDK automatically creates an operator-defined CMK and adds permissions for all target accounts in the Key Policy
C) A Region mismatch between the Pipeline and Prod accounts — a Region mismatch produces resource-not-found type errors, not a specific KMS decryption denial
D) Insufficient timeout on the deployment Lambda — an execution time limit problem shows up as a timeout error, not as KMS access denied

**Answer: B**

Explanation: The most common pitfall of multi-account CDK Pipelines. AWS managed KMS keys cannot be shared with other accounts, so decrypting artifacts across multiple accounts requires an operator-defined CMK. `crossAccountKeys: true` abstracts this infrastructure in the CDK (CMK creation, automatic Key Policy updates, S3 SSE-KMS configuration). In addition, the `--trust TOOLING-ACCT` option is needed in each target account's bootstrap (adding the Tooling account to the deploy role's trust policy). It costs an extra $1/month/key, but turning it on from the start is the standard.

---

**Question 7.** A SaaS introduced CDK Aspects and applied 30 cdk-nag rules to prod all at once, including forcing encryption on all S3 buckets, multi-AZ on all RDS, a dead letter queue on all Lambdas, and WAF association on all ALBs. The build failed with 1200 violations and all deployments stopped. What is an appropriate adoption strategy?

A) Disable all 30 rules to lift the deployment block — the build passes but it gives up security governance such as encryption, multi-AZ, and WAF wholesale, the opposite of the original purpose
B) Keep all 30 rules enforced at once and try to fix the 1200 violations in bulk — forcing broad simultaneous fixes while all deployments are stopped carries a high risk of regressions and downtime
C) Graceful rollout: step 1 set all rules to warning → measure the baseline violations → enforce starting with the 5 priority rules (those with high security impact) → add 5 to 10 enforced rules each quarter → a phased expansion over 6 months. The same pattern as CFN Hooks WARN→FAIL and K8s OPA Gatekeeper dryrun→warn→deny
D) Enforce the 30 rules only in prod and exclude dev/staging — this amounts to forcing everything at once on prod, where violations are the most numerous, so prod deployments are paralyzed all the same

**Answer: C**

Explanation: The general principle of introducing governance tools: enforcing all policies at once paralyzes operations, and phased adoption is the standard. (1) Measure with warnings, (2) enforce priority rules gradually, (3) give time to resolve existing violations. Security priority runs in the order of data (encryption), availability (multi-AZ), and exposure (public access). Never 30 rules at once. It is the same pattern as the 2022 incident where a SaaS hit 1200 violations from the cdk-nag NIST 800-53 Rev5 rule set. Aspects, Hooks, Config Rules, and OPA all recommend the same graceful rollout.

---

**Question 8.** A fintech removed 5 child AWS accounts from Organizations because of a subsidiary sale, and the baseline Stacks deployed by StackSets were automatically deleted, so the CloudTrail Trail inside them disappeared and 90 days of audit logs from just before the sale were lost. What is the most accurate combination to prevent recurrence?

A) Stop using AWS Organizations — the automatic cleanup trigger disappears, but it is an excessive response that gives up multi-account governance itself and does not solve the audit log retention problem either
B) Set `RetainStacksOnAccountRemoval=true` in the StackSet configuration + set `DeletionPolicy: Retain` on all stateful/audit resources (CloudTrail, the S3 log bucket) in the baseline template + where possible stream logs to a separate central account (Log Archive) to remove the dependency on member accounts
C) Have an operator manually back up the audit logs at the time of the account sale — a one-off procedure where logs are lost if a person forgets or misses the timing, so it does not prevent recurrence
D) Disable the baseline StackSet — it avoids the automatic deletion but stops baseline deployment to new accounts, creating a governance gap

**Answer: B**

Explanation: Defense in depth. (1) RetainStacksOnAccountRemoval=true: preserves the Stack itself when leaving an OU, (2) DeletionPolicy: Retain: preserves resources whatever the path of Stack deletion, (3) central Log Archive: preserves logs even if the member account disappears. All three must be done together to be safe. Any one alone has a bypass path (if you turn on only RetainStacksOnAccountRemoval and the resources in the Stack have the default DeletionPolicy=Delete, the resources vanish when the Stack is deleted). Control Tower's Log Archive account pattern is the implementation of this recommendation. Audit logs must not depend on a single account.

---

**Question 9.** A company adds a new environment (5 per-customer sandboxes) every week, and each time an operator edits the CodePipeline definition by hand and redeploys the pipeline with CFN. What is the most appropriate tool to automate this?

A) Plain CodePipeline + an operations script to update the definition — the pipeline definition and execution are separated, so the manual step of redeploying with an external script on every new environment remains
B) CDK Pipelines `selfMutation: true` + generating the environment list dynamically in CDK code (reading a JSON/YAML config file or a for loop). Just commit the new environment to Git and on the next run the UpdatePipeline stage adds the new Stage to the pipeline itself
C) Update the pipeline definition automatically with Lambda — it works, but you must implement idempotency, failure retries, and concurrent-change conflict handling yourself, so the operational burden is large
D) Manage the pipeline with Terraform — adding environments is possible with apply, but it is not a native flow where the pipeline updates itself like self-mutation

**Answer: B**

Explanation: Self-mutation = the pipeline updates itself in its first Stage. If the environment list is handled dynamically in CDK code, adding a new environment is reflected automatically with a single code commit. Plain CodePipeline (A) separates definition and execution, so modifying the pipeline needs a separate tool. Lambda self-update (C) is possible but burdens you with implementing idempotency and failure handling yourself. Terraform (D) is also possible, but CDK Pipelines' self-mutation is the most native. It is the cleanest AWS implementation of the GitOps principle "the pipeline is code too."

---

**Question 10.** In a 500-account environment, the security team requires evaluating in real time which accounts have GuardDuty disabled and automatically re-enabling it. What is the most appropriate multi-layered configuration?

A) Detect GuardDuty being disabled with StackSets Drift Detection alone — Drift is non-periodic and manually triggered with no automatic fix, so it alone does not satisfy the requirement of real-time evaluation and automatic re-enablement across 500 accounts
B) (1) Deploy GuardDuty with StackSets Service-managed (prevention) + (2) evaluate all accounts with the AWS Config Rule `guardduty-enabled-centralized` through an Org Conformance Pack (detection) + (3) register an SSM Automation Document as a Config Remediation Action to re-enable automatically when a violation is found (remediation) + (4) aggregate the results in Security Hub for operator visibility
C) Have one Lambda iterate over and check all 500 accounts directly — idempotency, cross-account assume-role, scale, and failure retries must all be implemented by hand, so the operational burden is large
D) Manually check all 500 accounts in the console every day — real-time evaluation is impossible and it depends on people, so the exposure window between disabling and re-enabling is long

**Answer: B**

Explanation: The three tools have separated roles: StackSets (prevention, resource deployment), Config Rules (detection, evaluation), SSM Automation (remediation, automatic restoration), and Security Hub (visibility, aggregation). StackSets Drift (A) is non-periodic/manually triggered and does not fix automatically, so it cannot be a standalone real-time solution. A single Lambda (C) means implementing idempotency, scale, and failure handling yourself. A Conformance Pack is a bundle that deploys Config Rules consistently across the entire Org and is the standard for multi-account evaluation. The four-part configuration is the implementation of NIST SP 800-204C's recommendation of "policy-as-code with continuous monitoring and remediation."

---

**Question 11.** A company injected an RDS password into a prod CloudFormation Stack with `'{{resolve:secretsmanager:prod/db:SecretString:password}}'`. After the security team rotated the password in Secrets Manager, they found it was not applied to RDS and was reflected only at the next Stack update. To synchronize automatically, what should be done?

A) Change the dynamic reference syntax to a different pattern — `{{resolve:...}}` is a fetch mechanism at deployment time, so no variant can automatically reflect a rotated secret in RDS
B) A dynamic reference is a fetch mechanism, not synchronization. Connect RDS and Secrets Manager with `AWS::SecretsManager::SecretTargetAttachment` + configure Secrets Manager Rotation Lambda (`enable-rotation`) — on rotation the Lambda updates RDS directly through the MasterUserPassword API and switches to the new secret version. CloudFormation only defines the rotation infrastructure
C) Have the security team manually synchronize the RDS password at every rotation — a procedure where people align two systems, so omissions and timing delays are inevitable and zero-downtime is not guaranteed either
D) Invoke a Lambda temporarily on rotation to update RDS — the direction is right, but without the SecretTargetAttachment connection and managed rotation configuration, a one-off invocation does not establish continuous automatic synchronization

**Answer: B**

Explanation: A question about understanding the essence of dynamic references. `{{resolve:...}}` is a mechanism that fetches from an external system at Stack deployment time and injects temporarily; it is not a tool that automatically tracks secret changes. Automatic rotation of the RDS password needs separate infrastructure: (1) connect secret to DB with SecretTargetAttachment, (2) rotate periodically with a Rotation Lambda (or Secrets Manager managed rotation), (3) the Lambda applies the new password through the RDS API. Drift Detection also does not catch secret changes, so track rotation events separately with EventBridge. The dynamic reference itself remains valid from the plaintext-protection standpoint.

---

**Question 12.** A company wants to set an IaC operating standard that satisfies all of the following requirements: (1) a human confirmation step on every prod change, (2) blocking unintended RDS replacement, (3) automatic baseline for new member accounts, (4) pre-blocking of security policy violations in prod CFN changes, (5) quickly codifying newly released AWS services, (6) consistently enforcing the common pattern across 200 microservices. What is the most appropriate tool mapping for each requirement?

A) Solve all 6 requirements with IAM policies — IAM controls only who calls what, so it cannot express configuration and governance requirements such as blocking RDS replacement, automatic baselines for new accounts, and enforcing a common pattern
B) Implement all 6 requirements directly with Lambda — you can make it work, but idempotency, failure retries, approval flows, and multi-layer validation must all be built by hand, so the operational burden explodes
C) (1) CodePipeline ManualApproval + ChangeSet review, (2) UpdateReplacePolicy=Snapshot + Stack Policy denying Replace, (3) Service-managed StackSets + AutoDeployment, (4) CloudFormation Hooks (or Control Tower Proactive Guardrails), (5) Custom Resource Lambda Provider, (6) your own CDK L3 Construct + Aspects/cdk-nag validation
D) Unify all 6 requirements with Terraform — you gain single-tool consistency but cannot directly replace AWS-native governance features such as pre-blocking (Hooks) and OU auto-deployment (StackSets)

**Answer: C**

Explanation: The comprehensive answer for exam scenarios. Each requirement points to a different tool, and attempts to solve everything with one tool (A/B/D) show governance immaturity. The tool mapping from all of Week 8: (1) ChangeSet + Approval = change control, (2) DeletionPolicy/UpdateReplacePolicy/StackPolicy = multi-layered change protection, (3) StackSets Service-managed AutoDeployment = multi-account fan-out, (4) Hooks = pre-blocking (admission control), (5) Custom Resource = extending the lifecycle engine, (6) CDK L3 + Aspects = code reuse + synthesis-time validation. The tool differs by problem, and you pick the most appropriate tool along the three axes of abstraction layer × governance scope × change timing.

---

## A Meta-Strategy for Solving Scenarios

Rather than memorizing the answer to each question, approach them with the following flow and any new scenario can be solved.

**Step 1: Map keywords to axes**
- "OU-level / multi-account automatic" → StackSets or Control Tower
- "Pre-block / prevent violations" → Hooks or Aspects/cdk-nag
- "Change preview / human approval" → Change Set + Manual Approval
- "Not supported by CFN / external system" → Custom Resource
- "Long wait / polling" → CDK Provider isComplete
- "Pipeline updates itself" → CDK Pipelines self-mutation
- "Replacement / downtime" → Review Replacement=True, protect with UpdateReplacePolicy
- "tfstate / multi-cloud" → Terraform

**Step 2: Judge single tool vs multi-layered defense**
- If keywords like "prevent recurrence," "security team standard," or "PCI/SOC 2" are present, the multi-layered defense is the answer
- Even if an answer that picks a single tool is attractive, go with the multi-layered one if it is more accurate

**Step 3: Check operational realism**
- Answers like "by hand across 200 accounts" or "daily in the console" are traps
- The answer where operators do not have to touch things every time in practice is correct
- Prefer tools that automate with a one-time setup

**Step 4: Exam trap patterns**
- A single-tool cure-all like "do everything with ~" is almost always a trap
- Options that put a side effect like "cost reduction" as the main answer are traps
- "Solve everything with IAM" is almost always a trap in IaC governance

---

## 📌 Week 8 Integrated Summary

Today's integrated scenarios are the settlement of all of Week 8's learning. To summarize, there are five principles.

First, **choose the abstraction layer appropriately**. CFN (low-level) → SAM (serverless macro) → CDK (code) each have their pros and cons, and the higher abstraction is not automatically the answer. For prod security policy, precise control with CDK L1 or direct CFN is recommended, and for repeated standard patterns, concentrating them in your own L3 Construct is the standard.

Second, **expand governance scope step by step**. Start from a single Stack and expand to multiple Stacks in one account (Cross-Stack/Nested), multi-account (StackSets), multi-account multi-environment (CDK Pipelines), and the Org level (Conformance Pack/Hooks). Adopt in stages to fit the company's size.

Third, **multi-layered validation across change timing**. All four stages, synthesis time (Aspects/cdk-nag/cfn-lint), pre-deployment (Change Set + Manual Approval, Hooks), and post-deployment (Drift Detection, Config Rules), prevent different incidents. A single layer has bypass paths.

Fourth, **multi-layered protection of stateful resources**. DeletionPolicy (on Stack deletion), UpdateReplacePolicy (on replacement from property changes), Stack Policy (on entering the Update API), Termination Protection (on DeleteStack API calls), and even separate backups (AWS Backup), a five-layer defense. A single policy can always be bypassed.

Fifth, **graceful rollout of governance tools**. Phased adoption of Hooks WARN→FAIL, cdk-nag warning→error, Config Rule notify→remediate, and OPA dryrun→warn→deny is the standard. Enforcing all policies at once causes operational paralysis.

## 🔜 Coming Up in Week 9

Next week we move into the area of configuration management: **SSM Parameter Store, AppConfig, Secrets Manager, EC2 Image Builder, Patch Manager**. If IaC defined the "shape of the infrastructure," configuration management handles "the values that infrastructure needs to operate." As Week 8's dynamic reference `{{resolve:ssm:...}}` meets Week 9's Parameter Store operating principles, the same mechanism is revealed in greater depth.

---

> Week 8 complete. From CloudFormation's 13 years of accumulated governance assets to CDK Pipelines self-mutation, we have passed once through the whole realm of modern IaC operations. In your final check before the exam, if you re-solve this article's 12 scenarios again, where you are weak will become clear.
