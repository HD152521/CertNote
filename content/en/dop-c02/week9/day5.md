# Day 5 - Week 9 Integrated Review: Operations Automation as One Picture

Viewed separately, the things we saw across this week's five posts are a set of unrelated tools: SSM Run Command, Session Manager, Patch Manager, State Manager, Inventory, AppConfig, Parameter Store, and Secrets Manager. But they are really answers from different angles to a single question: **"How do you operate a fleet of thousands of machines, and the applications running on them, safely without humans touching them by hand?"** Today, instead of listing the individual features again, we tie them together as scenarios to see how these tools mesh into one picture in real operations. The DOP exam does not ask you to memorize a single feature; it asks "which combination fits this situation?", so training yourself to think in scenarios is exam preparation.

## Week 9 on One Page: The 4 Axes of Operations Automation

Organizing the Week 9 tools into four axes gives you the whole picture.

```
The 4 axes of operations automation
==================================================
[Command/Access]  Run Command (one-time commands) / Session Manager (shell, tunnel)
[Enforce State]   State Manager (apply desired state on a schedule) / Inventory (collection)
[App Config]      AppConfig (feature flags, dynamic config + validation + automatic rollback)
[Secrets]         Parameter Store (config, free) / Secrets Manager (rotation)
       └─ Common foundation: SSM Agent (pull model) · IAM · KMS · CloudTrail (audit)
```

Two shared principles run through these four axes. One is **declarative operations**: instead of "do this (command)", you declare "it must be in this state (goal)" and the system converges toward it on its own (State Manager, AppConfig, Patch Baseline). The other is **blast radius control**: you never apply a change to everything at once; you spread it gradually and stop on failure (max-concurrency/max-errors, AppConfig deployment strategies, Patch Maintenance Window).

> 💡 **Related theory**: These two principles are core doctrine of reliability engineering. Declarative operations is **closed-loop control** from control theory: a feedback loop that keeps measuring the difference between the target state and the current state and works to reduce that error. The Kubernetes reconciliation loop, Terraform's desired state, and Git's declarative config all share the same root. Blast radius control is **progressive delivery** and the circuit breaker pattern, the rule of thumb that "change is risky, so split the risk into small pieces and detect problems quickly." The whole of Week 9 is the AWS implementation of these two principles.

> 📚 **Case study**: The 2017 AWS S3 outage in us-east-1 is a textbook case of what happens when an operational command is thrown at everything without blast radius control. An engineer ran a debugging command meant to remove a few servers from the billing system, but because of a typo in the input, far more servers than intended were removed at once. Core subsystems of S3 went into cascading restarts, those restarts took hours, and many services across us-east-1 stopped. The lesson is clear: a fleet-scale command must have controls that apply it to only a portion at a time (max-concurrency) and stop on failure (max-errors). AWS afterward added a safety limit on how fast that tool can remove capacity. The gradual rollout of Run Command and the Maintenance Window of Patch Manager that we saw in Week 9 are exactly the mechanisms that prevent this kind of incident.

## Crossroads in Tool Selection, Seen Through Scenarios

What is easy to confuse on the exam is "which of two similar-looking tools is the right one." If you sort out the key crossroads in advance, the scenarios become easy.

**Run Command vs State Manager.** Both run commands on instances. The difference is time. Run Command is **one-time**: you fire it once, now. State Manager is **periodic and continuous**: it enforces "it must always be in this state" on a schedule and reports compliance. "One emergency patch right now" means Run Command; "the CloudWatch Agent must always be installed on every instance" means State Manager.

**AppConfig vs Parameter Store.** Both hold configuration. The difference is the safety mechanisms. Parameter Store only stores values. AppConfig is a "configuration deployment pipeline" with **a deployment strategy (gradual rollout) + a Validator (validation before deployment) + a Monitor (automatic rollback when an alarm is detected)**. If "a bad configuration must be automatically rolled back when deployed", choose AppConfig; if it is "just reading a value", choose Parameter Store.

**Secrets Manager vs Parameter Store (SecureString).** Both store secrets encrypted. The difference is rotation. If you need rotation, use Secrets Manager; if the secret is static, use Parameter Store. And the cost differs by a factor of ten.

**Session Manager vs Bastion.** Both are ways to reach private instances. A Bastion exposes port 22 to the internet and must always be running, making it an attack target. Session Manager connects with an IAM identity without any open port and audits the entire session. Choosing a Bastion in a new design is a wrong answer.

**StackSets vs individual stacks.** When deploying the same infrastructure to multiple accounts and multiple Regions, creating a stack separately in each account makes the operational burden explode. StackSets deploys one template to many accounts and Regions at once, and when integrated with Organizations (Service-managed) it works at the OU level and even supports automatic deployment to new accounts (Auto-deployment). If the clues are "organization-wide", "all member accounts", and "automatic when a new account is added", it is StackSets.

Compressing these crossroads into a single table gives you something you can pull out instantly in the exam room.

| Confusing pair | Deciding criterion | Clue keywords |
|---|---|---|
| Run Command vs State Manager | One-time vs periodic enforcement | "always", "periodically", "also for new instances" → State Manager |
| AppConfig vs Parameter Store | Gradual deployment and automatic rollback or not | "without redeploying code", "automatic rollback", "feature flag" → AppConfig |
| Secrets Manager vs Parameter Store | Whether rotation is needed | "rotate every 30 days", "zero-downtime" → Secrets Manager |
| Session Manager vs Bastion | Port exposure and auditing | "remove SSH keys", "session auditing", "without a Bastion" → Session Manager |
| StackSets vs individual stacks | Multi-account and automatic deployment | "entire organization", "new accounts automatically" → StackSets |

> Underneath these crossroads lies a hidden grading criterion of the exam: "operational overhead." The DOP exam asks not for "an answer that works" but for "the answer with the least operational overhead that is also safe." So even when two answers produce the same result, an answer that uses a managed feature (State Manager, --manage-master-user-password, AppConfig automatic rollback) is more likely to be correct than one that has you build it directly (high overhead), such as writing a Lambda function. When the options say "write a Lambda function to...", "run a script with cron", or "provision an EC2 instance to...", first suspect that there is a more managed alternative. This is the meta-strategy for solving DOP scenarios.

> 🎯 **Scenario**: "Automatically deploy the same SSM Patch Baseline and IAM role to 50 member accounts across the organization, and it must apply automatically when a new account is added to the OU." The answer is CloudFormation StackSets with Service-managed permissions + Auto-deployment. StackSets deploys stacks per OU, and when AutoDeployment is turned on, the stack is deployed automatically whenever a new account enters the OU. An answer that uses Lambda to detect account additions and then deploy (high operational overhead), or manual deployment, is wrong. When the clue "organization-wide, automatic when an account is added" appears, think of StackSets Auto-deployment.

> 🎯 **Scenario**: "We operate a hybrid of an on-premises data center and AWS. We want to manage passwords, access, and patching in both environments with as uniform a toolset as possible." The answer is to make full use of SSM's hybrid extension. If you register on-premises servers as mi- managed instances with a Hybrid Activation, Run Command, Session Manager, Patch Manager, and Inventory work exactly as they do on EC2; for secrets, keep Secrets Manager as the single source of truth, and on-premises apps read the same secrets over VPN/Direct Connect. The key is "do not run two sets of tools": in a hybrid scenario, choosing a separate on-premises-only tool as the answer is almost always wrong.

## Summary

The way of thinking that runs through Week 9 is this. When you read a problem, first identify **which of the 4 axes it belongs to** (command/access, state enforcement, app configuration, secrets), and then work through, in order, **time (one-time vs continuous)**, **safety mechanisms (whether rollback or validation is needed)**, **operational overhead (managed first)**, and **audit requirements (CloudTrail, session logs)**. These four questions solve almost every Week 9 scenario. The 10 questions below cement that way of thinking.

---

## 📝 Practice Questions

**Question 1.** You want to apply OS security patches automatically to hundreds of EC2 instances only during the early hours of Saturday, and for prod, apply them only after a validation period following the patch release. What is the most appropriate configuration?

A) An operator manually runs Run Command every Saturday: the time slot can be matched, but it depends on people, so omissions and human error occur, and there is no validation period (approve-after-days) or compliance reporting

B) A combination of Patch Baseline (approve-after-days) + Patch Group + Maintenance Window (cron)

C) Call a Lambda daily to run yum update: without a managed patch workflow, you must build time-slot control, the validation period, and blast radius control all yourself

D) Insert a patch script into each instance's userdata: it runs only once at first boot and cannot guarantee the Saturday early-hours window or the prod validation period

**Answer: B**

Explanation: The standard of Patch Manager is that three elements share responsibility for "what (the Baseline's approve-after-days secures the validation period), where (Patch Group tag), and when (the Maintenance Window cron for early Saturday)." Because approve-after-days approves automatically only after a period of crowd validation following the patch release, prod's validation requirement is met. A, C, and D, which do not use managed features, carry a large operational burden and have no compliance reporting.

---

**Question 2.** You must gradually expose a feature flag from 10% → 50% → 100% without redeploying code, and it must roll back automatically to the previous configuration if the 5xx error rate exceeds a threshold. What do you use?

A) Store the flag in Parameter Store and have the app poll periodically: reading the value works, but there is neither gradual exposure of 10→50→100 nor automatic rollback when the 5xx threshold is detected, so the core requirements are not met

B) AppConfig (gradual deployment strategy + automatic rollback through the Environment's CloudWatch Alarm Monitor)

C) Store the flag JSON in S3 and distribute it with Lambda: the gradual deployment strategy and alarm-linked automatic rollback would all have to be built yourself, a large operational burden

D) Redeploy through the pipeline every time the flag changes: this directly violates the requirement of no code redeployment and provides neither gradual exposure nor automatic rollback

**Answer: B**

Explanation: Parameter Store only stores values and has no gradual deployment or automatic rollback. AppConfig is a configuration deployment pipeline with a deployment strategy (gradual 10→50→100 via Linear/Canary) and a Monitor (automatic rollback when a CloudWatch Alarm is detected). All three clues, "without redeploying code + gradual + automatic rollback," point to AppConfig.

---

**Question 3.** You want to rotate the RDS master password every 30 days, but new and in-flight connections must not fail even at the moment of rotation. There are many new connections per second. What is the most appropriate choice?

A) Single User Rotation: because it replaces one user's password in place, AWSCURRENT and the actual DB value are briefly inconsistent between setSecret and finishSecret, so some high-frequency new connections fail

B) Multi User (Alternating Users) Rotation

C) Store it in Parameter Store SecureString and rotate manually: there is no rotation automation or zero-downtime switching mechanism, so it does not satisfy the zero-downtime requirement in a high-frequency connection environment

D) An operator changes the password manually every day: it depends on people, so neither 30-day-cycle automation nor zero-downtime switching of connections is guaranteed

**Answer: B**

Explanation: With Single User, the actual DB password and the AWSCURRENT value are briefly inconsistent between setSecret and finishSecret, so some failures can occur on high-frequency new connections. Multi User never touches the user currently in use throughout the rotation; it changes the unused user and then switches over, so it is truly zero-downtime.

---

**Question 4.** You want to minimize the cost of 100 simple configuration values and 5 passwords that need rotation.

A) Everything in Secrets Manager (about $42 per month)

B) 100 configuration values in Parameter Store Standard (free) + 5 passwords in Secrets Manager ($2/month)

C) Everything in Parameter Store Advanced

D) Everything as plaintext in environment variables

**Answer: B**

Explanation: The deciding axis is "is rotation needed?" Configuration values that need no rotation go in Parameter Store Standard for free, and only the passwords that need rotation go in Secrets Manager ($0.40 each). The mix costs $2 per month, versus about $42 if everything is in Secrets Manager. Plaintext environment variables (D) violate security.

---

**Question 5.** An app in account B wants to fetch a secret from account A. You set up both the Resource Policy and B's IAM permissions, yet you get AccessDenied at the KMS stage. What is the cause?

A) There is no VPC Peering between the two accounts: Secrets Manager is a Regional endpoint API call, so VPC peering is irrelevant, and it also does not fit the failure being pinpointed as AccessDenied at the KMS stage

B) The secret is encrypted with an AWS managed key (alias/aws/secretsmanager) whose Key Policy cannot be modified → a CMK is needed

C) The two accounts' Regions are the same: being in the same Region cannot cause a cross-account decryption denial and is in fact the normal condition

D) It happens because the secret name is too long: the name length does not affect ARN references and has no causal relationship with the lack of KMS Decrypt permission

**Answer: B**

Explanation: Because of envelope encryption, decrypting a secret requires kms:Decrypt on the KMS key that encrypted it. For an AWS managed key, the user cannot modify the Key Policy, so decryption permission cannot be granted to another account. So even if secret access passes, you are blocked at decryption. You must encrypt the secret with a customer managed key (CMK).

---

**Question 6.** You want to remove the burden of managing operators' SSH keys, control access to private instances with IAM, and audit all session input and output in a tamper-proof way.

A) Bastion EC2 + regular SSH key rotation: it leaves an always-on attack target exposing port 22, is the opposite of the requirement to remove the SSH key management burden, and shell history can be erased by the user, so it is unsuitable as audit evidence

B) Session Manager + session logging (CloudWatch Logs + S3 + KMS) + IAM access control

C) Introduce a VPN to reach the private network: it opens the network path but provides neither removal of the SSH key burden, IAM-based access control, nor tamper-proof session auditing

D) Attach an EC2 key pair to an IAM User: you still have to manage SSH keys and it does not satisfy the audit requirement of recording all session input and output in a tamper-proof way

**Answer: B**

Explanation: Session Manager removes SSH keys, port 22, and the Bastion altogether. Access is controlled by IAM (who can StartSession), and all session input and output is recorded on the AWS side so operators cannot tamper with it. CloudTrail (when the session started) + the session log (what was run) make a complete audit. SSH shell history can be erased by the user, so it is unsuitable as audit evidence.

---

**Question 7.** In an environment where new EC2 instances are constantly created and terminated by an ASG, the CloudWatch Agent must always be installed on every instance and the standard state must be enforced.

A) Just bake the CloudWatch Agent into the AMI: it is installed at boot, but there is no drift correction for Agent updates or when someone removes it, and no compliance reporting

B) A State Manager Association (AWS-ConfigureAWSPackage) + tag targeting for periodic enforcement

C) Manually run Run Command whenever the ASG launches an instance: it is a one-time command, so it cannot automatically include new instances and does not enforce state continuously

D) Insert an install script into each instance's userdata: it runs only once at first boot and provides no later drift correction, Agent updates, or compliance tracking

**Answer: B**

Explanation: State Manager does "periodically enforce the desired state + compliance reporting + automatic application to new instances." Because the target is tag-based, newly launched instances automatically get the association too, guaranteeing the standard state after the first boot. Baking into the AMI (A) alone cannot handle Agent updates or drift correction, and Run Command (C) is one-time, so it cannot automatically include new instances.

---

**Question 8.** You want to collect the software inventory of hundreds of thousands of instances and query "instances that have a specific vulnerable version of a package installed" with SQL.

A) Manually load each instance's package list into DynamoDB: you would have to build the collection and refresh pipeline yourself, and SQL queries are not natural at the scale of hundreds of thousands, a large operational burden

B) SSM Inventory collection → aggregate to S3 with Resource Data Sync → query with SQL in Athena

C) Query with CloudWatch Logs Insights: it is a log search tool and does not fit collecting and aggregating instance software inventory metadata across the fleet

D) SSH into each instance to check package versions: having people walk through hundreds of thousands of machines is unrealistic and makes central aggregation and SQL queries impossible

**Answer: B**

Explanation: SSM Inventory collects each instance's software and configuration metadata, and Resource Data Sync aggregates it centrally in S3. Querying the data gathered in S3 with standard SQL in Athena finds "instances with a specific version installed" in one go. It is the standard data pipeline for fleet-wide analysis.

---

**Question 9.** A Lambda invoked thousands of times per second calls Secrets Manager GetSecretValue directly every time, and ThrottlingException occurs intermittently. The secret changes only once every 30 days.

A) Just request an increase of the Secrets Manager API limit: the wasteful structure of reading a rarely changing secret thousands of times per second remains, so neither cost nor throttle risk fundamentally decreases

B) A TTL cache with the AWS Parameters and Secrets Lambda Extension (localhost:2773)

C) Store the secret in plaintext in Lambda environment variables: calls decrease, but it is a security violation exposing the secret in plaintext and the 30-day rotation is not reflected automatically

D) Put a sleep before every call to avoid the throttle: it does not reduce the call volume itself and only increases latency, an anti-pattern that worsens performance

**Answer: B**

Explanation: Reading a rarely changing secret thousands of times per second is wasteful. The Lambda Extension runs a cache proxy inside the function instance so that only the first call hits the real API and responses are served from the local cache for the TTL. Real API calls drop to once per TTL per instance, so the throttle disappears and cost drops sharply.

---

**Question 10.** You want to manage 200 physical servers in a data center and an AWS EC2 fleet under a single patch policy and report compliance for both environments in the same console.

A) Operate a separate patch tool for the physical servers: you must maintain two sets of tooling and it directly violates the requirement of integrated compliance reporting in a single console

B) Install the SSM Agent on the physical servers + register with a Hybrid Activation (mi- ID), then apply the same Patch Baseline, Group, and Maintenance Window as EC2

C) Migrate all 200 physical servers to EC2: it achieves integration, but the large-scale migration cost and duration are excessive and it negates the very premise of maintaining hybrid operations

D) Operators patch the physical servers manually: it depends on people, causing omissions and delays, and they are not included in the same compliance reporting as EC2

**Answer: B**

Explanation: If you register on-premises servers as SSM managed targets (mi- prefix) with a Hybrid Activation, you can use Patch Manager, Run Command, and Inventory exactly as on EC2, and they are included in the same tag targeting and compliance reporting. It is the standard for managing a hybrid fleet in an integrated way from a single console.

---

**Question 11.** You want to deploy the same SSM Patch Baseline and IAM role to all member accounts in the organization, and it must apply automatically when a new account is added to the OU. How do you minimize operational overhead?

A) An operator manually deploys a CloudFormation stack to each member account: a person must intervene every time a new account is added, which is a large operational burden and does not satisfy the automatic OU application requirement

B) CloudFormation StackSets (Service-managed permissions + Auto-deployment) deploying at the OU level

C) A Lambda detects the account-added event and deploys the stack: it works, but you must build idempotency, cross-account permissions, and failure retries yourself, a larger operational burden than managed options

D) Manually run Terraform apply per account: a person must run apply for every new account, so there is no automatic deployment when an account is added to the OU

**Answer: B**

Explanation: StackSets' Service-managed permissions integrate with AWS Organizations and deploy stacks at the OU level. When Auto-deployment is on, the stack is deployed automatically when a new account enters the OU, and cleaned up when an account leaves. The answer that detects and deploys directly with Lambda (C) works but carries a large operational burden; DOP prefers managed features.

---

**Question 12.** An urgent zero-day vulnerability has been announced, and you must apply a specific patch to prod immediately without waiting for the usual approve-after-days (7 days) policy. What do you use in the Patch Baseline?

A) Change approve-after-days to 0 across the board: not just the one urgent patch but every patch is approved immediately, risking the installation of other unvalidated patches in prod

B) Add that patch directly to the Patch Baseline's explicit approval list (approved patches)

C) Delete the Patch Group tag to bypass the baseline: targeting is severed so no patch is applied, the opposite result of an urgent application

D) Run the Maintenance Window more often: it only raises the frequency of application, and if the patch is still waiting out approve-after-days it is still not approved, so it is not applied immediately

**Answer: B**

Explanation: A Patch Baseline has approval rules (everyday automation) and explicit approve/reject lists (exception handling). For an urgent patch, adding it directly to approved patches approves it immediately, with no approve-after-days wait, and it gets applied. If you change approve-after-days to 0 (A), not only that patch but every patch is approved immediately, risking the installation of other unvalidated patches too. Use the division of roles: approval rules for normal times, the explicit list for exceptions.

---

## 📌 Week 9 Wrap-Up

The key of this week is that the four axes of operations automation, namely command/access (Run Command/Session Manager), state enforcement (State Manager/Inventory), app configuration (AppConfig), and secrets management (Parameter Store/Secrets Manager), mesh together on the common foundation of the SSM Agent's pull model and IAM, KMS, and CloudTrail. The two principles running through them are declarative operations (convergence to a target state) and blast radius control (gradual rollout + stop on failure). When solving a scenario, working through the order of identifying the 4 axes → time → safety mechanisms → operational overhead → audit requirements solves almost every problem. And remember that DOP's hidden criterion is always "the managed answer with the least operational overhead."

From next week (Week 10) we move into deeper monitoring and dig deep into CloudWatch.
