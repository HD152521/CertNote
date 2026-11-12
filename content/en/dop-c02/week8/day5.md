# Day 5 - Week 8 Integrated Scenario: IaC Tools Meeting Within One Incident

After Week 8, you've seen seven tools: CloudFormation's Nested/Cross-Stack, StackSets' Service-managed, Custom Resource's ResponseURL protocol, Hooks' pre-validation, CDK's Construct levels and Pipelines self-mutation, Terraform tfstate locking. Tests don't present these tools separately. **Hard-difficulty exam questions embed three, four of them simultaneously within one scenario asking "which tool solves this where."** Today builds that integrated sense.

Before problem-solving, organize again. IaC tools divide into **three axes: abstraction layer, governance scope, change timing**. Abstraction climbs CFN(YAML) → SAM(macros) → CDK(code). Governance expands single Stack → multi-Stack single account → multi-account (StackSets/Pipelines) → org-level. Change timing has four gates: synth-time (Aspects/cdk-nag) → pre-deploy (Hooks) → deploy-during (ChangeSet) → post-deploy (Drift/Config). Exam scenarios ask "on which axis is the answer."

## Week 8 Full Tool Comparison

| Tool | Abstraction | Governance | Change Timing | One-Line Summary |
|------|---|---|---|---|
| **CloudFormation** | Declarative YAML | Stack unit | Deploy time | Foundation engine, 13 years of governance |
| **SAM** | CFN macro + serverless DSL | Stack | Synth→deploy | Serverless boilerplate shorthand |
| **CDK** | Code (TS/Py/Java) | Stack | Synth→deploy | LLVM IR pattern, code reusability |
| **CDK Pipelines** | Code | Multi-environment | Self-mutating CI | Pipelines as code, GitOps |
| **StackSets** | CFN sync | Multi-account multi-region | OU fan-out | 1000+ accounts, single truth source |
| **Custom Resource** | Lambda Provider | Stack internal extension | Deploy-during call | Lifecycle engine extension |
| **CFN Hooks** | Resource Type Provider | Stack or Org | Pre-deploy block | K8s ValidatingAdmissionWebhook pattern |
| **CFN Drift** | Detection mechanism | Stack/StackSet | Post-deploy compare | Detection-only, no auto-fix |
| **Change Set** | Change preview | Stack | Pre-deploy review | Replacement=True danger signal |
| **Terraform** | HCL | tfstate unit | plan→apply | Multi-cloud, tfstate self-manage |
| **CDKTF** | Code → HCL | tfstate | Synth | CDK syntax + Terraform Provider |

This table on hand, scenarios become clear. Each scenario tests "which axis holds the answer."

---

## 📝 Practice Questions

**Question 1.** A fintech deploys the same GuardDuty/CloudTrail/Config baseline to 200 child accounts in an AWS Organizations environment, and the same baseline must be applied automatically to new accounts added every week. The security team also requires minimizing everyday use of the management account. What is the most appropriate configuration?

A) Deploy with self-managed StackSets, with operators manually adding the account ID and a pre-created IAM execution role for each new account — unrealistic for 200 accounts plus new ones every week, and it does not reduce management account use either
B) Trigger Lambda from the EventBridge account creation event to apply the baseline to each account with boto3 — idempotency, failure retries, concurrency limits, and rollback must all be implemented yourself
C) Register the Tooling account as a delegated administrator + service-managed StackSets + AutoDeployment Enabled targeting the OU
D) Have operators configure GuardDuty, CloudTrail, and Config directly in every account over SSH/the console — manual operations that abandon infrastructure automation, impossible at the scale of 200 accounts

**Answer: C**

Explanation: All three requirements point to different tools. (1) Automatic application to 200 accounts = service-managed (the chicken-and-egg problem of self-managed), (2) automatic for new accounts = AutoDeployment Enabled, (3) protecting the management account = delegating to a delegated administrator. C is the combination that satisfies all three. Self-managed (A) requires IAM in advance, which is unrealistic for 200 accounts; invoking Lambda directly (B) puts the burden on you to implement idempotency, failure handling, and concurrency policy yourself; and D ignores infrastructure automation. On the exam, when the keywords "OU-level + automatic" appear together, the answer is almost always service-managed + AutoDeployment.

---

**Question 2.** A SaaS company deployed an RDS DBInstance change to a prod CloudFormation stack, which unintentionally replaced the database and caused 6 hours of downtime. What is the most appropriate combination to strengthen the standard change procedure so the same incident does not recur?

A) Deploy identically to all environments with the single line `aws cloudformation deploy` — the replacement is executed as is, without a chance for a human to review the Replacement=True information in the change set
B) A 3-stage CodePipeline setup of CreateChangeSet → ManualApproval (forcing review of the change set Replacement information) → ExecuteChangeSet + DeletionPolicy=Snapshot/UpdateReplacePolicy=Snapshot on the prod RDS + a stack policy that denies Replace/Delete
C) Only add the `--require-approval=any-change` option — it merely adds a confirmation to every change, with neither a data backup on RDS replacement (UpdateReplacePolicy) nor a Replace block (stack policy), so there is a single line of defense
D) Only strengthen the deployment IAM permissions to restrict RDS change permissions — IAM controls only who can make changes and cannot prevent the replacement risk of a legitimate change that passes through CFN

**Answer: B**

Explanation: The root cause of the incident was three overlapping flaws: (1) deploying directly without change set review, (2) UpdateReplacePolicy not set, and (3) no stack policy. With only one line of defense, the same incident recurs. With defense in depth: (1) a change set + manual approval forces human review (a SOC 2/PCI governance requirement), (2) UpdateReplacePolicy=Snapshot backs up data on replacement, and (3) a stack policy blocks Replace/Delete itself. `aws cloudformation deploy` (A) does not show change set information, and IAM (D) is weak against changes that pass through CFN.

---

**Question 3.** In a CloudFormation environment run by a game company, the `VpcId` export of the network stack is used as an ImportValue by 50 other stacks. When they tried to update the network stack to expand the VPC, the entire deployment stopped with a "Cannot update Export" error. Which answer satisfies both the immediate fix and long-term improvement?

A) Immediately delete and recreate the network stack — the moment the VpcId export disappears, the 50 dependent stacks bound by ImportValue break at the same time, and deleting the VPC halts all workloads
B) Immediate: temporarily remove the ImportValue from the 50 dependent stacks → update the network stack → re-add the ImportValue to the dependent stacks, as a 3-step deployment. Long term: migrate from cross-stack exports to SSM Parameter Store + dynamic references (`{{resolve:ssm:/network/vpc-id:1}}`)
C) Consolidate the 51 stacks into one nested stack tree — the export lock disappears, but everything becomes tightly coupled and the blast radius of a small change grows to all 50 stacks
D) Migrate everything to Terraform — avoids the lock through tfstate references, but the migration cost is large and it does not immediately remove the current "Cannot update Export" block

**Answer: B**

Explanation: An export is locked while in use (the same pattern as the 2022 case of a game company whose prod deployments were paralyzed for 12 hours). For the immediate fix there is no method other than the 3-step deployment — removing the ImportValue on the dependent side is the condition for releasing the lock. To prevent the same incident in the long term, switch to Parameter Store as AWS best practices recommend. Version-explicit dynamic references control the impact of unintended changes. Deleting and recreating the stack (A) breaks all 50 dependent stacks too, consolidating into nested stacks (C) tightly couples all 50 stacks and enlarges the blast radius, and Terraform (D) is costly and does not solve the root problem.

---

**Question 4.** A company wants to codify a newly released AWS Bedrock model in CloudFormation, but found that some deep features are not yet supported by CFN. They plan to handle only that part with a custom resource Lambda. What is the most important design element for operational stability?

**Answer: B** - The Lambda must always send a PUT response to the ResponseURL in every branch (Create/Update/Delete + exceptions) + keep the PhysicalResourceId identity key (returning a new ID on Update triggers an automatic resource replacement) + long-running work uses the isComplete pattern of the CDK Provider framework with Step Functions polling

---

**Question 5.** A SaaS deploys the same pattern (Lambda + DynamoDB + API Gateway + X-Ray + CloudWatch alarm) to 200 microservices with CDK. The security team wants to apply a new policy. How can it be enforced consistently without modifying the code of the 200 services?

**Answer: B** - Your own L3 construct (`StandardLambdaApiPattern`) + validating the entire tree with CDK Aspects (`Annotations.addError`) + blocking at synth time with the cdk-nag rule set + blocking at deployment time with CFN Hooks, as a multi-layer defense

---

**Question 6.** A game company is deploying three environments, Dev/Staging/Prod, with CDK Pipelines, but after adding the Prod account the build fails with a "KMS access denied" error.

**Answer: B** - `crossAccountKeys: true` is not set. AWS managed keys cannot be shared with other accounts; a CMK is needed

---

**Question 7.** A SaaS introduced CDK Aspects and applied 30 cdk-nag rules to prod at once, and the build failed with 1200 violations, halting all deployments.

**Answer: C** - Graceful rollout: start with all rules as warnings → measure the baseline → gradually enforce the priority rules

---

**Question 8.** A fintech removed five child AWS accounts from Organizations because of a subsidiary sale. The baseline stacks deployed with StackSets were deleted automatically, the CloudTrail trails inside them disappeared, and 90 days of audit logs from just before the sale were lost. What is the most accurate combination to prevent recurrence?

A) Stop using AWS Organizations — the automatic cleanup trigger disappears, but this is an excessive response that gives up multi-account governance itself and does not solve the audit log retention problem
B) Set `RetainStacksOnAccountRemoval=true` in the StackSet configuration + set `DeletionPolicy: Retain` on all stateful/audit resources in the baseline template (CloudTrail, S3 log buckets) + where possible, stream logs to a separate central account (Log Archive) to remove the dependency on member accounts
C) Have an operator manually back up the audit logs at the time of the account sale — a one-time procedure that loses the logs if a person forgets or misses the timing, so it does not prevent recurrence
D) Disable the baseline StackSet — it avoids automatic deletion, but baseline deployment to new accounts stops, creating a governance gap

**Answer: B**

Explanation: Defense in depth. (1) RetainStacksOnAccountRemoval=true: preserves the stack itself when an account leaves the OU, (2) DeletionPolicy: Retain: preserves resources regardless of the path by which the stack is deleted, (3) a central Log Archive: preserves logs even if the member account disappears. All three must be done together to be safe. Any one alone has a bypass path (if you only turn on RetainStacksOnAccountRemoval and the resource DeletionPolicy inside the stack is the default Delete, the resources disappear when the stack is deleted). The Control Tower Log Archive account pattern is an implementation of this recommendation. Audit logs must not depend on a single account.

---

**Question 9.** A company adds a new environment every week (five per-customer sandboxes), and each time an operator edits the CodePipeline definition by hand and redeploys the pipeline with CFN. What is the most appropriate tool to automate this?

A) Regular CodePipeline + an operations script to update the definition — the pipeline definition and execution are separated, so the manual step of redeploying with an external script every time a new environment is added remains
B) CDK Pipelines `selfMutation: true` + generate the environment list dynamically in CDK code (read a JSON/YAML config file or use a for loop). Just commit the new environment to Git, and in the next execution the UpdatePipeline stage adds the new stage to the pipeline itself
C) Update the pipeline definition automatically with Lambda — it works, but idempotency, failure retries, and concurrent change conflict handling must be implemented yourself, so the operational burden is large
D) Manage the pipeline with Terraform — adding environments with apply is possible, but it is not a native flow in which the pipeline updates itself like self-mutation

**Answer: B**

Explanation: Self-mutation = the pipeline updates itself in the first stage. If the environment list is handled dynamically in CDK code, adding a new environment is reflected automatically with a single code commit. With regular CodePipeline (A), the definition and execution are separated, so a separate tool is needed to modify the pipeline. Lambda self-updating (C) is possible but you must build idempotency and failure handling yourself. Terraform (D) is also possible, but CDK Pipelines' self-mutation is the most native. It is the cleanest AWS implementation of the GitOps principle that "the pipeline is also code."

---

**Question 10.** In a 500-account environment, the security team requires real-time evaluation of which accounts have GuardDuty disabled and automatic re-enablement. What is the most appropriate layered configuration?

A) Detect GuardDuty being disabled using StackSets drift detection alone — drift detection is aperiodic and manually triggered with no automatic remediation, so it cannot alone satisfy the real-time evaluation and automatic re-enablement requirements across 500 accounts
B) (1) Deploy GuardDuty with service-managed StackSets (prevention) + (2) evaluate all accounts with the AWS Config rule `guardduty-enabled-centralized` through an organization conformance pack (detection) + (3) register an SSM Automation document as a Config remediation action to re-enable automatically when a violation is found (remediation) + (4) aggregate the results in Security Hub to give operators visibility
C) Loop through the 500 accounts directly with a single Lambda function — idempotency, cross-account assume-role, scale, and failure retries must all be implemented yourself, so the operational burden is large
D) Manually inspect the 500 accounts in the console every day — real-time evaluation is impossible and it depends on people, so the exposure window between disablement and re-enablement grows long

**Answer: B**

Explanation: Separation of roles among the tools — StackSets (prevention, resource deployment), Config rules (detection, evaluation), SSM Automation (remediation, automatic restoration), Security Hub (visibility, aggregation). StackSets drift (A) is aperiodic/manually triggered and does not remediate automatically, so it cannot be a standalone real-time solution. A single Lambda function (C) means building idempotency, scale, and failure handling yourself. A conformance pack is a bundle that deploys Config rules consistently across the whole organization and is the standard for multi-account evaluation. The four-layer configuration implements the "policy-as-code with continuous monitoring and remediation" recommendation of NIST SP 800-204C.

---

**Question 11.** A company injected an RDS password into a prod CloudFormation stack using `'{{resolve:secretsmanager:prod/db:SecretString:password}}'`. When the security team rotated the password in Secrets Manager, it was not applied to RDS and only took effect the next time the stack was updated. How can this be synchronized automatically?

A) Change the dynamic reference syntax to a different pattern — `{{resolve:...}}` is a fetch mechanism at deployment time, so no variation of it can automatically reflect a rotated secret in RDS
B) A dynamic reference is a fetch mechanism, not synchronization. Connect RDS and Secrets Manager with `AWS::SecretsManager::SecretTargetAttachment` + configure a Secrets Manager rotation Lambda (`enable-rotation`) — on rotation the Lambda updates RDS directly through the MasterUserPassword API and switches to the new secret version. CloudFormation only defines the rotation infrastructure
C) Have the security team manually synchronize the RDS password on every rotation — a procedure in which people align two systems, so omissions and delays are unavoidable and zero downtime is not guaranteed
D) Call a Lambda function temporarily at rotation time to update RDS — the direction is right, but without the SecretTargetAttachment link and managed rotation configuration, a one-time call does not establish continuous automatic synchronization

**Answer: B**

Explanation: This question tests understanding of the essence of dynamic references. `{{resolve:...}}` is a mechanism that fetches from an external system at stack deployment time and injects temporarily; it is not a tool for automatically tracking secret changes. Automatic RDS password rotation requires separate infrastructure: (1) connect the secret to the DB with SecretTargetAttachment, (2) rotate periodically with a rotation Lambda (or Secrets Manager managed rotation), and (3) the Lambda applies the new password through the RDS API. Drift detection also does not catch secret changes, so track rotation events separately with EventBridge. The dynamic reference itself is still valid for protecting plaintext.

---

**Question 12.** A company wants to set an IaC operating standard that satisfies all of the following requirements: (1) one human confirmation step for every prod change, (2) blocking unintended RDS replacement, (3) automatic baseline for new member accounts, (4) preventive blocking of security policy violations in prod CFN changes, (5) fast codification of newly released AWS services, (6) consistent enforcement of the common pattern across 200 microservices. What is the most appropriate mapping of tools to requirements?

A) Solve all six requirements with IAM policies — IAM only controls who calls what, so it cannot express configuration and governance requirements such as blocking RDS replacement, automatic baselines for new accounts, and enforcing common patterns
B) Implement all six requirements directly with Lambda — it can be made to work, but idempotency, failure retries, approval flow, and multi-layer validation would all have to be built by hand, so the operational burden explodes
C) (1) CodePipeline ManualApproval + ChangeSet review, (2) UpdateReplacePolicy=Snapshot + a stack policy denying Replace, (3) service-managed StackSets + AutoDeployment, (4) CloudFormation Hooks (or Control Tower proactive guardrails), (5) a Custom Resource Lambda provider, (6) your own CDK L3 construct + Aspects/cdk-nag validation
D) Unify all six requirements with Terraform — you gain single-tool consistency, but it cannot directly replace AWS-native governance features such as preventive blocking (Hooks) and automatic OU deployment (StackSets)

**Answer: C**

Explanation: The comprehensive correct answer of the exam scenario. Each requirement points to a different tool, and attempts to solve everything with one tool (A/B/D) show immature governance. The tool mapping of all of Week 8's study — (1) ChangeSet + approval = change control, (2) DeletionPolicy/UpdateReplacePolicy/StackPolicy = layered change protection, (3) StackSets service-managed AutoDeployment = multi-account fan-out, (4) Hooks = preventive blocking (admission control), (5) Custom Resource = extending the lifecycle engine, (6) CDK L3 + Aspects = code reuse + synthesis-time validation. Tools differ by problem, and you choose the most appropriate tool along three axes: abstraction layer × governance scope × time of change.

---

## 📌 Week 8 Wrap-up

Today's integrated scenarios are the culmination of the whole Week 8 study. In summary, there are five principles.

First, **choose the right abstraction layer**. CFN (low level) → SAM (serverless macro) → CDK (code) each have pros and cons, and a higher abstraction is not always the answer. For prod security policy, precise control with CDK L1 or direct CFN is recommended, and repeated standard patterns are consolidated into your own L3 constructs as the standard.

Second, **expand the governance scope in stages**. Start with a single stack and expand to multiple stacks in a single account (cross-stack/nested), multiple accounts (StackSets), multiple accounts and multiple environments (CDK Pipelines), and the organization level (conformance packs/Hooks). Adopt in stages to match the size of the company.

Third, **multi-layer verification at change time**. All four stages — synth time (Aspects/cdk-nag/cfn-lint), pre-deployment (change set + manual approval, Hooks), and post-deployment (drift detection, Config rules) — prevent different incidents. With only one layer, a bypass path exists.

Fourth, **multi-layer protection of stateful resources**. DeletionPolicy (on stack deletion), UpdateReplacePolicy (on replacement due to property changes), stack policy (at Update API entry), termination protection (DeleteStack API call), and finally separate backups (AWS Backup), for a five-tier defense. A single policy can always be bypassed.

Fifth, **graceful rollout of governance tools**. The standard is phased adoption: Hooks WARN→FAIL, cdk-nag warning→error, Config rule notify→remediate, OPA dryrun→warn→deny. Enforcing all policies at once paralyzes operations.

Week 9 Preview

Next week we enter the realm of configuration management. **SSM Parameter Store, AppConfig, Secrets Manager, EC2 Image Builder, Patch Manager**. If IaC defined the "shape of infrastructure," configuration management deals with "the values that infrastructure needs in order to operate." The Week 8 dynamic reference `{{resolve:ssm:...}}` meets the Week 9 Parameter Store operating principles, and the same mechanism is revealed in more depth.

---

> Week 8 complete. We have passed through the entire scope of modern IaC operations, from the 13-year-old governance assets of CloudFormation to CDK Pipelines self-mutation. When you re-solve the 12 scenarios in this article during the final check before the exam, it will become clear where you are weak.
