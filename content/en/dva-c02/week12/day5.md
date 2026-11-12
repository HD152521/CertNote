# Day 5 - Week 12 Comprehensive Review: Threading Containers and IaC Into One Picture

The pieces you picked up scattered across the week — the isolation model of ECS and Fargate, CloudFormation's declarative engine, SAM's macro, CDK's synthesis, and the coupling principles of serverless architecture — are really just different answers to one large question: "How do we get containers and functions running on the cloud safely and repeatably, without a human clicking through a console?" This review is not a re-listing of individual facts. The goal is to thread those facts onto a single line of reasoning about **why they were designed that way**, so that a reworded question on exam day doesn't shake you.

The container and IaC area of DVA-C02 is a major pillar of the Deployment domain. Straight memorization questions do show up (Fargate = awsvpc, SAM requires Transform), but what actually separates scores are the scenario questions that ask "which layer is the root cause of this symptom" — is an ECR pull failure an IAM problem or a network problem, could a Change Set have prevented that failed stack update, was the duplicate the result of missing idempotency. This article re-binds the essence of Week 12 into comparison tables and "why," then closes with 12 real-world scenario questions.

## Week 12 on One Page: Five Pillars and How They Connect

Week 12 is built on five pillars, and they all meet on a single deployment pipeline.

```
[Developer] Code + infrastructure definition (sam.yaml / cdk.py)
   |
   v
[CodeCommit/Git] → [CodeBuild]
                     - cdk synth / sam build
                     - docker build → ECR push
   |
   v
[CloudFormation / CodeDeploy]
   - ECS service rolling / blue-green update
   - Lambda version and alias switch
   |
   v
[ECS Fargate task] ←── [ECR image pull]
   - taskRole grants runtime access to DynamoDB/S3/SQS
```

Seeing where each pillar fits into this picture cuts the confusion down considerably.

- **ECS/Fargate/ECR**: the data plane (where containers actually run) and the image supply chain.
- **CloudFormation**: the final execution engine for all IaC. SAM and CDK both converge here.
- **SAM**: a CloudFormation macro for serverless.
- **CDK**: programming language → CloudFormation synthesis.
- **Serverless architecture principles**: how loosely you couple the functions that run on top of all this.

> 💡 **Related theory**: The philosophy running through this entire pipeline is the **declarative model**. An ECS service declares "the desired task count" and a reconciliation loop makes reality match it; CloudFormation declares "the desired resource state" and the engine computes the gap against the current state and applies it. Unlike the imperative model ("run these commands in this order"), the declarative model states only the target state and lets the system work out the path to reach it. That difference is exactly what makes **idempotency** possible (applying the same template twice produces the same result) and **self-healing** possible (when state drifts, it gets pulled back). Nearly every tool in Week 12 shares this declarative philosophy — which is why the intuition you build on one tool transfers to the others.

## The Container Layer: Tracing a Symptom Back to Its Cause

ECS scenario questions almost always ask "given this symptom → which layer is the cause." Nail this mapping down as a table and you'll hold up against the variations.

| Symptom | Most common root cause | Layer |
|------|---------------------|------|
| Image pull fails | executionRole lacks ECR permissions | IAM (startup) |
| Image pull fails (private subnet) | No NAT or VPC endpoint, so ECR is unreachable | Network |
| Task won't start because secret injection fails | executionRole lacks `secretsmanager:GetSecretValue` | IAM (startup) |
| App is up but gets AccessDenied on S3/DynamoDB | taskRole permissions are insufficient | IAM (runtime) |
| Task won't start + subnet IPs exhausted | awsvpc consumes an ENI/IP per task | Network |
| ECR push authentication error in CI | get-login-password token expired after 12 hours | Authentication |

The key branch in this table is **"startup time or runtime."** executionRole holds the permissions ECS infrastructure uses **before** the container comes up (ECR pull, log group creation, secret injection); taskRole holds the permissions the application code uses **after** the container is up (calls to DynamoDB, S3, SQS). "Inject a secret as an environment variable" is a startup-time action, so it's executionRole; "the app calls Secrets Manager directly at runtime" is taskRole. Same Secrets Manager — but a different point in time means a different role.

> ⚠️ **Trap**: The same phrase, "Secrets Manager access failed," splits two ways. If the failure occurs while the task definition's `secrets` block is **injecting the value into an environment variable** → injection happens at startup, so it's an **executionRole** problem. If the failure occurs while the app **calls `getSecretValue` directly** through the SDK at runtime → it's a **taskRole** problem. The exam aims squarely at this subtle difference. Sort by "injection or runtime call" first.

> 🔍 **Going deeper**: The fact that Fargate enforces awsvpc and nothing else is the root of IP-exhaustion incidents. awsvpc hands every task a real ENI and its own private IP — 100 tasks take 100 IPs out of the subnet. On a /24 subnet (roughly 251 usable IPs) that also hosts other resources, you run dry fast. On the EC2 launch type you additionally hit the per-instance ENI limit, which varies by instance type. So when a scenario says "Fargate tasks suddenly fail to start while scaling out, with IP/ENI shortage," the answer is "add a subnet with a larger CIDR" or "spread across multiple subnets." Once you understand that the price of giving each task its own ENI for isolation is IP consumption, there's nothing left to memorize.

## The IaC Layer: The Mechanisms That Make Change Safe

CloudFormation scenarios concentrate on two things: "how do you make a change safely" and "how do you handle deletion and protection." The concept pairs people most often confuse split cleanly along the line of "what exactly is being protected."

| Concept | What it does | Common confusion |
|------|-------------|-----------|
| **Change Set** | Previews the resources that will change **before** the update | Confused with Drift Detection (detecting actual differences) |
| **Drift Detection** | Detects **actual differences** introduced by hand in the console after deployment | Not automatic (manually triggered) |
| **DeletionPolicy: Retain** | **Keeps** that one resource when the stack is deleted | Confused with Termination Protection |
| **Termination Protection** | Blocks deletion of the **stack itself** | Confused with DeletionPolicy (per-resource) |
| **Stack Policy** | Protects specific resources **during** a stack update | Confused with Termination Protection (deletion) |
| **Nested Stack** | Nests stacks as modules within one account | Confused with Stack Set (multi-account/region) |

Memorize three core distinctions. (1) **Change Set is "a preview before the update," Drift is "detecting the actual difference after deployment"** — opposite points in time. (2) **DeletionPolicy is per-resource, Termination Protection is per-stack** — the scope of what's protected differs. (3) **Nested Stack modularizes within one account, Stack Set deploys across multiple accounts and regions through Organizations** — the reach differs.

> 💡 **Related theory**: The way CloudFormation works out the order in which to create resources is a **topological sort**. Dependencies between resources (`!Ref`, `!GetAtt`, `DependsOn`) form a directed graph, and CloudFormation topologically sorts that graph to build things "depended-upon first" — VPC, then subnet, then EC2. If a circular dependency appears (A references B and B references A), a topological sort is impossible and CloudFormation raises an error. Thanks to this graph, you never have to specify order yourself, and resources with no dependency on each other are created in parallel, which speeds up the deployment. "Just declare it and the ordering takes care of itself" is topological sort under the hood.

> 📚 **Case study**: In February 2017, a GitLab operator deleted the data directory of the wrong server by hand during a recovery operation, wiping roughly 300GB of production data. The incident burned "letting humans touch infrastructure directly is dangerous" into the industry's memory and highlighted the value of **preview and approval gates** like IaC and Change Sets. In CloudFormation, a Change Set does exactly that job — before anything is actually applied, it shows what will be added, modified, and **deleted**, so a human can catch at review time the case where a stateful resource like RDS would be unintentionally replaced and its data lost. That's why "review the Change Set, then apply" — rather than "update straight away" — is the standard.

> ⚠️ **Trap**: `!ImportValue` can only pull in values Exported by stacks **within the same region** — cross-region and cross-account references don't work. On top of that, while another stack is Importing a value you Exported, you cannot change that Export or delete the stack that Exported it (a dependency lock). Any option along the lines of "pull a value from another region with ImportValue" is a trap; in that situation you need SSM Parameter Store or some other mechanism.

## SAM and CDK: Two Shortcuts to the Same Destination

SAM and CDK start from the same complaint — "writing raw CloudFormation is too verbose" — and solve it in different ways. Here are the essentials again.

| Item | SAM | CDK |
|------|-----|-----|
| Input | YAML (macro) | Programming language (TS/Python/Java/C#/Go) |
| How it expands | `Transform` expands short YAML into long CFN | `synth` turns code into CFN |
| Specialty | Serverless (Lambda/API/DDB) | General purpose + high abstraction |
| Local testing | `sam local` (requires Docker) | (weak first-party support) |
| Required declaration | `Transform: AWS::Serverless-2016-10-31` | bootstrap (once per account/region) |
| End result | CloudFormation | CloudFormation |

The truth they share is that **the destination is CloudFormation**. SAM decompresses YAML; CDK synthesizes code. The difference lies in the expressive power of the input — SAM keeps standardized serverless patterns short, while CDK expresses complex infrastructure that needs loops, conditionals, types, and tests as real code.

> 🔍 **Going deeper**: Why `sam local` requires Docker is a subtle point. A Lambda function runs in a specific AWS runtime environment (Amazon Linux based, with fixed library versions). Your local machine differs from that environment, so simply running the function on your laptop produces the classic "works locally, breaks on Lambda" environment mismatch. `sam local` runs the function inside a **Docker image that mirrors the AWS-provided Lambda runtime**, imitating the real Lambda environment locally — this is the fundamental value of containers ("the same environment everywhere") applied to testing. That's why `sam local` doesn't work without Docker.

> 💡 **Related theory**: SAM's `Transform` is a kind of CloudFormation **macro**. A macro is metaprogramming — "a program transforms the template before it is deployed" — which is precisely the same idea as macros in programming languages (Lisp, Rust) that expand code into other code before compilation. One `AWS::Serverless::Function` block goes through macro expansion and unfolds into several resources: `AWS::Lambda::Function`, `AWS::IAM::Role`, `AWS::Logs::LogGroup`, and more. Where CDK produces a template by executing code, SAM inflates a template through declarative macro expansion — both are code generation that "expands a compressed representation."

## Serverless Coupling: The Original Sin of the Synchronous Call

Of all the architecture principles in Week 12, the one the exam loves most is "don't have one Lambda synchronously invoke another Lambda directly." If you memorize this as nothing more than "double the cost," you'll fold on a reworded question, so let's tie it back to the root one more time.

The four sins of a synchronous direct invoke: **double billing** (execution time is charged on both), **error propagation** (a failure in B becomes a failure in A), **timeout stacking** (B has to finish inside A's limit), and **coupled scaling** (throughput is locked 1:1). The fix is to insert an asynchronous intermediary, and which intermediary you pick depends on the scenario.

- **Split off work for one place to process** → SQS (queue, 1:1, buffering, retries, DLQ)
- **One event that many places receive at once** → SNS (pub/sub, 1:N, fan-out)
- **Routing on event content / schedules / SaaS integration** → EventBridge
- **Ordering, complex branching, human approval** → Step Functions

> ⚠️ **Trap**: An SQS standard queue is **at-least-once** delivery, so duplicates are normal and the consumer must be **idempotent** (duplication is unavoidable in distributed systems because of the Two Generals problem). If you truly need "exactly-once processing plus strict ordering," that's the **FIFO queue** — but throughput is lower (300 per second, 3,000 with batching). On the exam, "ordering and duplicate prevention are mandatory" means FIFO; "high throughput first, and the app handles idempotency" means the standard queue. The option claiming "the standard queue guarantees ordering" is always a trap.

## Wrapping Up

If you bind Week 12 into one sentence: "Deploy containers and functions safely with **declarative IaC**, and wire them together with **loose, asynchronous coupling**." ECS holds the desired state through its reconciliation loop, Fargate builds serverless isolation on Firecracker, and executionRole/taskRole split permissions along the line between startup time and runtime. CloudFormation untangles resource ordering with a topological sort and shows you changes in advance through Change Sets, while SAM and CDK converge on CloudFormation by way of macro expansion and code synthesis respectively. The serverless architecture on top resolves the original sin of the synchronous direct call with a queue, and absorbs the duplication that at-least-once creates through idempotency. Most scenario questions on the exam pick some point along this chain and ask "which layer is the root cause of this symptom" — the sense for distinguishing timing (startup vs runtime), protection scope (resource vs stack), and coupling model (1:1 vs 1:N) is what earns the points.

That closes out the Week 12 container and IaC unit. Next week we move on to observability and troubleshooting (CloudWatch, X-Ray, CloudTrail), covering how to look inside the system you deployed and fix it.

---

## 📝 Week 12 Comprehensive Scenario Questions

**Question 1.** You tried to place 50 Fargate tasks in a single /28 subnet (about 11 usable IPs), but some tasks fail to start with IP/network-related errors. Which is the correct root cause and fix?

A) The taskRole lacks permission to create EC2 ENIs, so it cannot get an IP — add `ec2:CreateNetworkInterface` to the taskRole

B) awsvpc mode consumes an ENI/private IP per task, exhausting the subnet's IPs — add a subnet with a larger CIDR or spread tasks across multiple subnets

C) Only some tasks fail to start because the executionRole lacks ECR pull permission — add ECR permissions to the executionRole

D) The task definition revision is outdated and the network configuration is missing — register a new revision and redeploy

**Answer: B**

Explanation: Fargate enforces awsvpc mode, which assigns **a dedicated ENI and one private IP to each task**. 50 tasks require 50 IPs, but a /28 subnet has only about 11, so they are exhausted. The fix is to use a subnet with a larger CIDR or to spread tasks across multiple subnets/AZs. A and C are IAM permission issues unrelated to IP exhaustion, and D is an environment-variable change scenario that is irrelevant.

---

**Question 2.** You configured the task definition's `secrets` block to inject a DB password from Secrets Manager into an environment variable, but the task cannot even start because it cannot retrieve the secret. Where should the permission be granted?

A) Grant `secretsmanager:GetSecretValue` to the taskRole so the app reads the secret

B) `secretsmanager:GetSecretValue` on the executionRole

C) Add `secretsmanager:GetSecretValue` to an EC2 instance profile, which Fargate does not have

D) It is a network reachability problem caused by a missing Secrets Manager VPC endpoint, not a permissions problem

**Answer: B**

Explanation: **Fetching the secret and injecting it as an environment variable is done by the ECS infrastructure (agent) before the container starts**, so it requires the **executionRole** permissions. The taskRole is used when the app calls the SDK directly at runtime — here the task could not even start, so runtime permissions are irrelevant. Remember: "injection = startup time = executionRole". Even with the same Secrets Manager, the role differs depending on "injection" versus "direct runtime call". C) Fargate has no EC2 instance profile at all (serverless isolation). D) A secret injection failure is typically an IAM permission problem; a missing network path is not the first suspect.

---

**Question 3.** A Fargate task in a private subnet cannot pull an image from ECR. The executionRole has sufficient ECR permissions. What should you suspect next?

A) The task definition revision is immutable, so the image tag points to an old digest and the pull fails

B) The private subnet has no NAT gateway or VPC endpoints for ECR/S3, so ECR cannot be reached

C) An ECR lifecycle policy expired and deleted the image, so there is nothing to pull

D) The taskRole lacks ECR read permission, so it cannot fetch the image at runtime

**Answer: B**

Explanation: If the pull fails despite sufficient permissions, it is a **network reachability** problem. For a task in a private subnet to reach ECR (and the S3 where image layers are stored), it needs a NAT gateway (via the internet) or ECR and S3 VPC endpoints (a private path). With neither, an "image pull failure" occurs. A is irrelevant, C is a separate problem for when the image actually does not exist, and D is a runtime permission and has nothing to do with the pull. Branch as: "permissions OK but pull fails = network".

---

**Question 4.** You are about to update a production CloudFormation stack and worry that the RDS instance may be unintentionally replaced and the data lost. How can you check which resources will change and how before applying?

A) Run update-stack right away and rely on rollback triggers to recover automatically if there is a problem

B) Create a Change Set, review the list of resources to be added, modified, deleted, or replaced, and then apply it

C) Run Drift Detection to detect in advance the resources that will change after applying

D) Delete the stack and recreate it to build the desired configuration from a clean state

**Answer: B**

Explanation: A **Change Set** shows in advance, **before** the update is actually applied, which resources will be added, modified, deleted, or **replaced**. Replacing a stateful resource such as RDS can lead to data loss, so reviewing the Change Set lets a person catch the risk beforehand. A accepts the risk with no preview, C) Drift is a separate feature that detects the "difference between what was deployed and what actually exists" (not a preview of future changes), and D certainly destroys the data.

---

**Question 5.** Even if the stack is deleted, you want only the S3 bucket inside it (holding important data) to be retained and not deleted. How do you configure this?

A) Turn on Termination Protection for the stack so the bucket is preserved when the stack is deleted

B) Set `DeletionPolicy: Retain` on that S3 bucket resource

C) Put the S3 bucket resource in a Stack Policy Deny to protect it from deletion

D) Turn on Drift Detection so that it detects the difference and blocks the bucket when it is about to be deleted

**Answer: B**

Explanation: **DeletionPolicy: Retain** specifies, **per resource**, "keep this resource even if the stack is deleted". It is commonly used for S3, RDS, and other resources with important data. A) Termination Protection prevents deletion of the **stack itself** (not per resource), so its purpose is different. C) A Stack Policy protects resources during updates, and D) Drift detects differences and is irrelevant. Distinguish: "keep only the resource = DeletionPolicy, block deletion of the stack itself = Termination Protection".

---

**Question 6.** You try to deploy a SAM template, but the `Transform` declaration is missing, so it is processed as plain CloudFormation, which rejects `AWS::Serverless::Function` as an unknown resource type. What is needed?

A) Add a Parameters section to declare the Serverless resource type as a parameter

B) Declare `Transform: AWS::Serverless-2016-10-31` at the top level of the template

C) Add a Globals section defining common function properties so that the type is recognized

D) Export the function ARN in the Outputs section so that the resource type is registered

**Answer: B**

Explanation: SAM is a CloudFormation **macro**, and the `Transform: AWS::Serverless-2016-10-31` declaration tells the engine to "expand this short SAM syntax into long-form CloudFormation". Without this declaration, CloudFormation does not recognize `AWS::Serverless::*` resources. A, C, and D are optional sections unrelated to this error. "SAM = Transform required" is a key point that is also tested on its own.

---

**Question 7.** When a single order-completed event occurs, the inventory, email, and analytics systems must each process it **simultaneously**, and each consumer needs a buffer to withstand temporary bursts and failure isolation. What is the most suitable configuration?

A) Attach the inventory, email, and analytics consumers to a single SQS queue so that all three receive the same message

B) Fan out from an SNS topic to three SQS subscriptions (each SQS queue with a consumer and a DLQ)

C) The order Lambda synchronously invokes the inventory, email, and analytics systems in sequence and retries on failure

D) Use an EventBridge scheduled rule to periodically deliver the order event to the three systems

**Answer: B**

Explanation: Having multiple systems receive one event simultaneously is SNS fan-out, and **receiving each subscription through SQS** gives each consumer its own buffer, retries, and DLQ (failure isolation). SNS -> SQS -> consumer is better at absorbing bursts and preventing loss than having SNS subscribe Lambda directly. A) SQS is 1:1, so only one consumer takes a given message and all three cannot receive it. C) Sequential synchronous invocation causes coupling and propagation problems, and D) a schedule is irrelevant to this requirement.

---

**Question 8.** A payment-processing Lambda consuming an SQS standard queue occasionally processes the same message twice, causing double charges. What is the correct root-cause response?

A) Replace SQS with SNS because SQS cannot be trusted

B) A standard queue is at-least-once, so duplicates are normal; make the consumer idempotent with an idempotency key + DynamoDB conditional writes (`attribute_not_exists`), or use a FIFO queue

C) Limit Lambda concurrency to 1

D) Reduce the message size

**Answer: B**

Explanation: An SQS standard queue provides **at-least-once** delivery, so the same message may arrive twice (because of the Two Generals Problem, "exactly-once delivery" is impossible). When duplicates are fatal, as with payments, you must make the consumer **idempotent** — identify already-processed requests with an idempotency key and ignore duplicates with a DynamoDB conditional write. Alternatively, use a **FIFO queue**, which guarantees "exactly-once processing". A makes the model fit worse, C kills performance and is not a root-cause fix either, and D is irrelevant.

---

**Question 9.** Lambda A behind API Gateway hands heavy post-processing to Lambda B. Currently A invokes B synchronously, which is costly, and if B slows down the API response times out. What is the improvement?

A) Increase B's memory and timeout so it finishes faster, and keep the synchronous invocation structure

B) A puts the job into SQS and responds immediately, and B consumes the queue asynchronously

C) Merge A and B into one large Lambda to eliminate the overhead between invocations and the double billing

D) A triggers B asynchronously and then polls the status at 1-second intervals until the result is available

**Answer: B**

Explanation: With a synchronous invocation, A waits for B and is **billed twice**, and B's latency propagates into the API timeout. If A puts the job into SQS and returns immediately, the user gets a fast response, B drains the queue at its own pace and scales independently, and messages are preserved even if B fails (decoupling producer and consumer with a bounded buffer). A does not solve the root problems (coupling and billing), C breaks the single-responsibility principle, and D is inefficient.

---

**Question 10.** When you try to deploy infrastructure written with CDK for the first time to the ap-northeast-2 Region of a new AWS account, you get an error along the lines of the asset upload bucket not existing. What should you do first?

A) Re-run cdk synth to regenerate the template that includes the asset bucket definition

B) Run `cdk bootstrap` once for that account and Region to set up the S3, ECR, and IAM scaffolding for deployment

C) Clean up leftover stacks with cdk destroy and then deploy again from a clean state

D) Manually create the asset S3 bucket stack in the CloudFormation console and then deploy

**Answer: B**

Explanation: At deployment, CDK needs S3 and ECR to hold assets such as Lambda zips and Docker images, plus IAM roles for deployment, and `cdk bootstrap` lays down this scaffolding **once per account-Region combination**. For a new account/Region, bootstrap must come first. A) synth only generates the template and does not create the scaffolding, C) destroy is deletion, and D) manual creation is not part of the CDK workflow.

---

**Question 11.** You tried to use `!ImportValue` in a stack in us-east-1 to import a VPC ID that a network stack in ap-northeast-2 had exported, but it does not work. Why?

A) Because of a syntax error in which the Export name was written incorrectly in the `!ImportValue` syntax

B) Because !ImportValue supports Export/Import only between stacks within the same Region and cannot make cross-region references

C) Because the VPC ID is a resource type excluded from Export and thus can never be imported

D) Because the importing stack's execution role lacks permission to access us-east-1 resources

**Answer: B**

Explanation: `!ImportValue` (and Export) exchange values only between stacks **within the same Region** — cross-region and cross-account references are not supported. To share values across Regions you must use another mechanism such as SSM Parameter Store. A cannot be asserted to be a syntax problem, C) a VPC ID can be exported, and D is irrelevant. "ImportValue = same Region only" is a standalone exam point.

---

**Question 12.** You applied the same CloudFormation template twice in a row to the same environment, and the second application caused no changes and the resources stayed as they were. What is the basis for this behavior?

A) A bug where CloudFormation caches the identical template and skips the second application

B) CloudFormation is a declarative model, so if the "desired state" equals the current state there is nothing to change and it behaves idempotently

C) Because on the second application a Change Set produced an empty change set and blocked the update

D) Because Termination Protection was on and blocked the changes of the second application

**Answer: B**

Explanation: CloudFormation is **declarative**: you declare the "target state" and it applies only the difference from the current state. If the target state has already been reached, the second application has no difference to apply and changes nothing — this is **idempotency** (applying the same input multiple times gives the same result as applying it once). An imperative script could accumulate side effects when run twice, but declarative IaC does not. A misunderstands normal behavior, and C and D are not the cause of this behavior.

---
