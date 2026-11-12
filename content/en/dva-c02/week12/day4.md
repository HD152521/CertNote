# Day 4 - CDK and Serverless Architecture: The End of "Infrastructure as Code," and the Grammar of Good Design

The history of defining infrastructure as code is long. First came shell scripts configuring servers, then Chef/Puppet-like configuration management tools bringing "declare desired state and we'll converge to it," and AWS solidified it with CloudFormation — "bundle entire cloud resources in declarative templates." But YAML/JSON templates have one fundamental limit: they're data, not code. No loops, conditionals, type checking, function abstraction. Anyone who's hand-copied 1,000-line CloudFormation templates yearns "if only this were code." AWS CDK (Cloud Development Kit) is exactly that answer — write infrastructure in real programming languages, with output as CloudFormation.

CDK itself isn't deeply tested in DVA-C02 (synth creates CloudFormation, bootstrap once per account/region). But the surrounding "how to assemble serverless architecture" is the real exam weight — why Lambda directly calling Lambda is wrong, when SQS vs SNS vs EventBridge split, why idempotency matters. This article explores: how far up the abstraction ladder IaC has climbed, how CDK synthesizes code to CloudFormation, and what distributed systems theory underpins good serverless architecture.

## IaC's Abstraction Ladder: Shell Scripts to CDK

How we handle infrastructure has climbed higher in abstraction. Understanding this ladder shows why CDK is "the top rung."

- **Imperative scripts (shell, some Ansible)**: "Execute this command in this order." Same starting state needed each run for same result. Run twice and you might break things.
- **Configuration management (Chef, Puppet)**: Shift to "final state should be like this" declaratively. But mostly OS/package level, doesn't bundle all cloud resources.
- **Declarative templates (CloudFormation)**: Whole cloud resources in one declarative document, engine figures dependency order. But expressiveness is trapped in data (YAML/JSON).
- **Programmable IaC (CDK, Pulumi)**: Write infrastructure in real languages. Loops, conditionals, functions, types, tests all present. Result synthesizes back to declarative templates.

CDK's core insight: "keep safe declarative results, but make the process that produces them expressively imperative." Developers can loop in TypeScript to create 10 subnets, but what ultimately deploys is a declarative CloudFormation template CloudFormation validates and can rollback.

> 💡 **Related theory**: This mirrors compiler's **source code → intermediate representation (IR) → machine code** pipeline exactly. CDK code is "source," `cdk synth`-generated CloudFormation is "IR," CloudFormation engine calling real APIs is "machine execution." Compilers separate high-level language expressiveness from low-level executable reality; CDK separates high-level language abstraction from CloudFormation's safe deploy model. Most CDK code bugs catch in synth stage (template generation), not after resources half-build — like compile-time type errors.

> 🔍 **Going deeper**: CDK looks magical but **jsii** tool backs it. CDK's core logic is TypeScript-written once, jsii extracts type info and auto-generates Python/Java/C#/Go bindings. So Python CDK code calling `dynamodb.Table(...)` internally connects to same TypeScript implementation — not separate per-language, one implementation wrapped in multiple languages. That's why "CDK supports 5 languages yet behavior doesn't subtly differ per language" — the secret.

### Construct: CDK's Building Block

CDK is all **Construct** units. This brings object-oriented composition straight into infrastructure. Constructs split three levels (L1/L2/L3), core to CDK understanding.

| Level | Name | Meaning | Example |
|------|------|------|-----|
| **L1** | CFN Resources | 1:1 CloudFormation resource (`Cfn` prefix) | `CfnBucket` — specify every attribute |
| **L2** | Curated Constructs | Sensible defaults + convenience methods | `s3.Bucket` — encryption/versioning as methods |
| **L3** | Patterns | Bundle multiple resources as one pattern | `ApplicationLoadBalancedFargateService` |

L1 exposes CloudFormation nearly raw, max expressiveness but verbose. L2 does `table.grant_read_write_data(handler)` — one line auto-generates "let this Lambda read-write this table" IAM policy — turning hand-written IAM policy JSON pain into method call. L3 wraps "ALB + Fargate service + target group + security group" into one object.

> ⚠️ **Trap**: L2 Construct's `grant_*` methods "auto-generate least-privilege IAM policy" — convenient, but never reading the synth'd template means you deploy not knowing what permissions actually got created. For exams, "CDK auto-generates IAM" matters less than that auto-generation gets **baked into CloudFormation template from `cdk synth`** — CDK doesn't grant permissions at runtime; everything becomes CloudFormation resources deployed.

## synth and bootstrap: Two Things CDK Actually Does

Two exam-tested commands compress CDK workflow.

```bash
cdk bootstrap   # Once per account·region: set up S3 bucket, ECR, IAM role for CDK
cdk synth       # CDK code → CloudFormation template (doesn't deploy)
cdk diff        # Compare deployed stack to new template
cdk deploy      # synth + deploy CloudFormation
cdk destroy     # Delete stack
```

`cdk synth` "runs code and outputs CloudFormation template (JSON) to stdout." No AWS deployment here — purely local code executing into template. `cdk deploy` takes that template to CloudFormation to make real resources.

`cdk bootstrap` often confuses. CDK needs to upload assets (Lambda code zip, Docker image) somewhere so CloudFormation can reference it. bootstrap sets up that "somewhere" — S3 bucket, ECR repo, deploy IAM role — one-time prep. **Once per account-region combination**.

> 💡 **Related theory**: bootstrap's "set up infra-to-run-infra first" is **bootstrapping**, old computer science concept. Self-hosting compilers need an initial version compiled with another tool, OSes use tiny bootloaders loading bigger kernels. "Create minimum foundation to run itself" — the concept itself comes from "pulling yourself up by your bootstraps." CDK bootstrap creates "minimum resources for CDK deployment to run."

## CDK vs SAM vs CloudFormation: Same Destination, Different Abstraction

All three ultimately become CloudFormation. Difference is "how much abstraction and what specialization."

| Tool | Input | Specialty | Final transform | For whom |
|------|------|------|-----------|----------|
| **CloudFormation** | YAML/JSON template | General, all AWS resources | (itself) | Most stable standard needed |
| **SAM** | YAML (macro) | Serverless (Lambda/API/DynamoDB) | CloudFormation (Transform extension) | Quick serverless |
| **CDK** | Programming language | General + high abstraction | CloudFormation (synth) | Code reuse/expressiveness needed |

SAM is actually CloudFormation **macro** — `Transform: AWS::Serverless-2016-10-31` says "expand this brief SAM syntax into verbose CloudFormation." One `AWS::Serverless::Function` block expands at deploy to Lambda function + execution role + log group + (if needed) API Gateway resources. CDK expands code into template instead. Both "compress representation, expand to CloudFormation."

> 🔍 **Going deeper**: Which should you pick? Practical heuristic: team comfortable with YAML, pure serverless? **SAM** is leanest. Complex infra (VPC, ECS, multi-environment repetition) with code logic? **CDK**. Organization standardizes CloudFormation already, adding tools hard? **Stay CloudFormation**. Multicloud needed? Terraform/Pulumi but that's beyond AWS exams. For DVA: "SAM=serverless specialty, CDK=programming, both end CloudFormation."

> 📚 **Case study**: HashiCorp re-licensing Terraform August 2023 from open-source (MPL) to BSL (Business Source License) prompted community to fork **OpenTofu** under Linux Foundation. This taught "third-party IaC tools have license risk"; AWS-native CloudFormation/SAM/CDK are "vendor-locked but license-safe" relative win. IaC tool choice is governance/license, not just tech.

## The Core Antipattern: Why Lambda Directly Calling Lambda Is Wrong

Serverless's most-asked antipattern: "Lambda A **synchronously** invoking Lambda B directly." Memorizing surface reason ("double cost") fails on variations. See the root.

```
Bad:   [API GW] → [Lambda A] ──sync invoke──> [Lambda B]
Good:  [API GW] → [Lambda A] ──> [SQS] ──> [Lambda B]
```

On sync invoke (`InvocationType: RequestResponse`), Lambda A **blocks waiting** for Lambda B. Happening:

- **Double billing**: A and B run concurrently, both charge for execution time. A does nothing but wait yet pays.
- **Tight coupling and error spread**: B fails/slows, A fails/slows. B's outage propagates to A, then API Gateway.
- **Timeout stack**: A's timeout must cover B's completion. B slow, A times out, whole chain fails.
- **Can't scale independently**: A/B throughput locked 1:1. If B is slow, scale A too.

SQS between them solves everything. A puts message, returns instantly (no wait, no timeout, no cost waste). B consumes at own pace, independently scaling. B dead? Message queued until B revives. All solved.

> 💡 **Related theory**: "Queue between producer/consumer decoupling" is distributed systems classic **producer-consumer problem** and its solution **bounded buffer**. Production/consumption speed different, direct connection lets fast side overwhelm or slow side block. Buffer (queue) between lets both ignore each other's speed. SQS is that buffer. Queue buffering ability is **backpressure** — downstream inability to keep up doesn't forcefully block upstream, instead pending work stacks temporarily.

> 📚 **Case study**: February 2017 AWS S3 us-east-1 mass outage — services synchronously dependent on S3 collapsed in cascades. Services queuing work asynchronously handled S3 outage by buffering until recovery, then resumed normally. "Sync direct call spreads component failure, async via queue isolates and buffers" seared into industry. Lambda→SQS→Lambda guidance's real-world basis.

## SQS vs SNS vs EventBridge: Three Async Paths

"Don't call Lambda directly, use async" is easy. But which async medium — SQS, SNS, or EventBridge — varies per scenario. These three's messaging model difference is exam favorite.

| Service | Model | Key trait | Typical scenario |
|--------|------|-----------|------------------|
| **SQS** | Queue (1:1) | One message, one consumer takes/processes/deletes. Buffering, retry, DLQ | Job queue, load leveling, backpressure |
| **SNS** | Pub/sub (1:N) | One message, multiple subscribers get instantly (fan-out) | One event, many systems notified |
| **EventBridge** | Event bus (routing) | Content-based rule routing. SaaS, cron integration | Event routing, scheduling, third-party |

Core split: "**One message to one place** or **multiple places** simultaneously?" Splitting work load → SQS (one message = one consumer). Notifying multiple systems of one event → SNS (fan-out). And **SNS → multiple SQS** combo (fan-out) common — SNS spreads to SQs, each SQS buffers/retries for its consumer. EventBridge is higher tier — "route event by content via rules, schedule, third-party SaaS."

> 🔍 **Going deeper**: Why SNS→SQS→Lambda instead of SNS→Lambda direct? SNS directly invoking Lambda makes Lambda rely on SNS retry policy, no buffer for traffic spikes. SQS between: (1) message safely buffers even if consumer crashes (no loss), (2) consumer processes own pace, (3) failed messages go to DLQ for later analysis. "SNS pushes, SQS absorbs," combine both.

## Idempotency: Same Work Twice Stays Safe

Behind almost every serverless messaging trap: **at-least-once delivery**. SQS standard queues, SNS, Lambda async all promise "deliver **at least once**," not "exactly once." So same message **arrives twice or more**.

Why? "Exactly once" in distributed systems is near-impossible. Message sent, consumer responds "done," response lost on network — sender sees "failed" and resends. Consumer gets duplicate. To eliminate needs infinite wait or huge consensus cost, so practical systems choose "at least once + consumer tolerates dups."

So consumer must be **idempotent** — processing same request multiple times yields same result as once. Implementation usually:

- **Idempotency key**: Assign unique ID per request, check "did I already process this ID" before processing.
- **DynamoDB conditional write**: `attribute_not_exists(id)` condition, write only if ID absent. Second try fails condition (ignored).
- **SQS FIFO + dedup ID**: FIFO queue accepts same dedup ID only once in 5-min window (not perfect but reinforced).

> 💡 **Related theory**: "Exactly once" difficulty stems from **Two Generals' Problem** in distributed systems theory — proving impossible for two parties on unreliable network to reach common knowledge "message arrived" with certainty. ACK can get lost, sender can't forever know "did it reach," so resend happens, duplication results. Real answer isn't "force exactly once on system" but "at-least-once delivery + idempotent processing" for **exactly-once effect at application level**. That's why SQS/SNS/EventBridge all push idempotency.

> ⚠️ **Trap**: SQS **standard queue** is at-least-once and best-effort order (mostly ordered, not guaranteed). **FIFO queue** only ensures "exactly-once processing" + strict order — but lower throughput (300/sec, 3,000 batched) with cost/constraints. Exam: "order critical / never dupe" → FIFO; "high throughput first, app handles dupes idempotently" → standard. "Standard queue guarantees order" is always wrong.

## Other Good Serverless Design Principles

Beyond above, exam "well-designed architecture" roots in Well-Architected Framework's six pillars (Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, Sustainability).

- **Small functions, single responsibility**: One Lambda one job. Large function + multiple smaller + Step Functions orchestration better for debug/retry/scale. SRP moved to function level.
- **Cache aggressively**: API Gateway caching (response cache), DynamoDB-fronting DAX (microsecond reads), ElastiCache (general), Lambda in-memory cache (container reuse). Each layer cuts repeated read.
- **Cold start minimization**: Provisioned Concurrency (pre-warmed runners), SnapStart (snapshot restore), smaller package. Important for latency-sensitive sync APIs.
- **Backpressure and DLQ**: SQS DLQ isolates failed messages so one "poison message" doesn't block entire queue. Know downstream limits, Reserved Concurrency throttles surges.

> 🔍 **Going deeper**: "Small functions" not always right. Smaller = more cold starts, inter-function call latency/complexity ("Lambda pinball" — request bouncing between functions). Real practice: "single responsibility yet meaningful cohesive unit" — one domain's CRUD in one function with internal routing ("Lambdalith") common. Exams ask clear antipatterns, not gray zones — this tradeoff rarely tested.

## Summary

CDK's core: "write infrastructure in programming language expressiveness, synthesize result as CloudFormation's safe declarative model" — like compilers separating source from machine code. `synth` compiles code to template, `bootstrap` once-per-account preps deployment foundation. Serverless atop rests on distributed systems principles — Lambda direct calls decoupled with queues (bounded buffer/producer-consumer), at-least-once delivery's duplication tolerated via idempotency (Two Generals compromise), right async medium picked per scenario (SQS/SNS/EventBridge). Well-designed architecture combines these on Well-Architected pillars.

Next: Week 12 review synthesizing containers/IaC, then observability/troubleshooting (CloudWatch, X-Ray, CloudTrail).

---

## 📝 Practice Questions

**Question 1.** You are about to deploy a CDK project to a new account and Region for the first time and get a "bootstrap" related error. Which is correct about what `cdk bootstrap` does and how often it is run?

A) Run on every deployment, and it zips Lambda code

B) Run once per account-Region combination, and it sets up scaffolding resources needed for CDK deployment such as an S3 bucket, ECR, and IAM roles

C) It only converts CDK code to CloudFormation

D) It deletes existing stacks

**Answer: B**

Explanation: `cdk bootstrap` is a one-time task that sets up in advance the "scaffolding that makes deployment possible", such as the S3 bucket and ECR repository where CDK uploads assets (Lambda zips, Docker images) during deployment and the IAM roles used for deployment, and it is done **once for each account and Region combination**. This is the bootstrapping concept of "first create the minimal resources needed to run itself". A) It is one-time, not on every deployment. C) Converting code to a template is `cdk synth`. D) Deletion is `cdk destroy`.

---

**Question 2.** Which is correct about the difference between `cdk synth` and `cdk deploy`?

A) synth deploys resources immediately, and deploy only gives a preview

B) synth only synthesizes CDK code into a CloudFormation template without deploying, and deploy submits that template to CloudFormation to create the resources

C) The two are completely identical

D) synth is for Terraform and deploy is for CloudFormation

**Answer: B**

Explanation: `cdk synth` runs the CDK code locally to generate a CloudFormation template (JSON) and deploys nothing to AWS. `cdk deploy` submits that template to CloudFormation to actually provision the resources. This is like a compiler's separation of "source to intermediate representation (synth)" and "execution (deploy)". A describes the roles swapped, and C and D are not true.

---

**Question 3.** Lambda A behind API Gateway wants to hand off part of its work to Lambda B. What configuration is recommended in terms of cost, coupling, and fault tolerance?

A) Lambda A directly invokes Lambda B synchronously (RequestResponse)

B) Lambda A puts a message into SQS, and Lambda B consumes the queue

C) Merge Lambda A and B into one huge function

D) Lambda A polls Lambda B every second

**Answer: B**

Explanation: A synchronous direct call makes A wait for B and be **billed twice**, B's failures and delays **propagate** to A, and the scaling of the two is tied together. With SQS in between, A puts in a message and returns immediately without waiting (solving cost and timeout), B consumes at its own pace (independent scaling), and even if B is briefly down the messages remain in the queue (fault tolerance). This is the classic pattern of decoupling producer and consumer with a bounded buffer. A is an anti-pattern, C breaks single responsibility, and D is inefficient polling.

---

**Question 4.** When a single order-completed event occurs, (1) the inventory system, (2) email sending, and (3) the analytics pipeline must each receive that event **simultaneously** and process it on their own. What is the most suitable configuration?

A) Attach three consumers to one SQS queue

B) Subscribe the three systems (or an SQS queue for each) to an SNS topic and fan out

C) Lambda synchronously invokes the three systems in order

D) Write directly to the three places with DynamoDB Streams

**Answer: B**

Explanation: Having multiple systems receive one event **simultaneously** is pub/sub fan-out, and that is the model of **SNS**. Each subscriber (or SNS to SQS to consumer) receives a copy of the same message and processes it independently. A) With SQS, one consumer takes a message and deletes it (1:1), so not all three receive it. C) Sequential synchronous calls have coupling and propagation problems. D) Streams are for streaming table changes and do not directly fit this requirement.

---

**Question 5.** A Lambda consumer receiving messages from an SQS standard queue occasionally processes the same message twice, creating duplicate records. What are the root cause and the correct response?

A) It is an SQS bug, so contact AWS

B) A standard queue has at-least-once delivery so duplicates are normal; make the consumer idempotent (for example, ignore duplicate keys with a DynamoDB conditional write)

C) Delete the queue and recreate it

D) Increase the Lambda memory

**Answer: B**

Explanation: An SQS standard queue guarantees **at-least-once** delivery, so the same message can arrive more than once; this is because "exactly-once delivery" is practically impossible in distributed systems due to the Two Generals Problem. The right answer is not to try to change delivery but to make the consumer **idempotent**: use an idempotency key + a DynamoDB `attribute_not_exists` conditional write to ignore IDs that were already processed. Or, if strict deduplication is needed, use a FIFO queue. A, C, and D are responses that misunderstand the cause.

---

**Question 6.** Which is correct about a property that SAM templates and CDK have in common?

A) Both support multi-cloud

B) Both are ultimately converted to CloudFormation and deployed

C) Both must be written in TypeScript

D) Both are separate engines that replace CloudFormation

**Answer: B**

Explanation: SAM expands short YAML into long CloudFormation with the `Transform` macro, and CDK synthesizes programming-language code into a CloudFormation template with `synth`, so **both end up at CloudFormation**. The differences are the input form (SAM = YAML macro, CDK = programming language) and specialization (SAM = serverless). A) Multi-cloud is Terraform/Pulumi. C) CDK supports multiple languages and SAM is YAML. D) They are not separate engines; they sit on top of CloudFormation.

---

**Question 7.** The Lambda of a latency-sensitive synchronous REST API is slow on the first invocation because of a cold start. Which is NOT an appropriate way to reduce cold starts?

A) Pre-warm execution environments with Provisioned Concurrency

B) Reduce the deployment package size to shorten initialization time

C) Restore from a snapshot with SnapStart (Java, etc.)

D) Change Lambda A to invoke Lambda B synchronously

**Answer: D**

Explanation: Cold start mitigations are Provisioned Concurrency (keeping pre-warmed environments), SnapStart (restoring from an initialized snapshot), and reducing package size. D) Direct synchronous invocation between Lambda functions is not only unrelated to cold starts but an **anti-pattern** that increases cost, coupling, and error propagation, so it actually makes things worse. A cold start is a problem of the function's own initialization cost and is not solved by changing the invocation method.
