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

## 📝 연습 문제

**문제 1.** CDK 프로젝트를 새 계정·리전에 처음 배포하려는데 "bootstrap" 관련 오류가 난다. `cdk bootstrap`이 하는 일과 실행 빈도로 옳은 것은?

A) 매 배포마다 실행하며, Lambda 코드를 압축한다

B) 계정·리전 조합마다 1회 실행하며, CDK 배포에 필요한 S3 버킷·ECR·IAM 역할 같은 발판 자원을 깐다

C) CDK 코드를 CloudFormation으로 변환만 한다

D) 기존 스택을 삭제한다

**정답: B**

해설: `cdk bootstrap`은 CDK가 배포 과정에서 자산(Lambda zip, Docker 이미지)을 올려둘 S3 버킷·ECR 리포지토리와 배포용 IAM 역할 등 "배포를 가능하게 하는 발판"을 미리 까는 일회성 작업으로, **계정과 리전의 조합마다 한 번씩** 한다. 이는 "스스로를 돌리기 위한 최소 자원을 먼저 만든다"는 부트스트래핑 개념이다. A) 매 배포가 아니라 일회성이다. C) 코드→템플릿 변환은 `cdk synth`다. D) 삭제는 `cdk destroy`다.

---

**문제 2.** `cdk synth`와 `cdk deploy`의 차이로 옳은 것은?

A) synth는 즉시 자원을 배포하고, deploy는 미리보기만 한다

B) synth는 CDK 코드를 CloudFormation 템플릿으로 합성할 뿐 배포하지 않고, deploy는 그 템플릿을 CloudFormation에 올려 자원을 만든다

C) 둘은 완전히 동일하다

D) synth는 Terraform용, deploy는 CloudFormation용이다

**정답: B**

해설: `cdk synth`는 로컬에서 CDK 코드를 실행해 CloudFormation 템플릿(JSON)을 생성할 뿐, AWS에 아무것도 배포하지 않는다. `cdk deploy`는 그 템플릿을 CloudFormation에 제출해 실제 자원을 프로비저닝한다. 이는 컴파일러의 "소스→중간 표현(synth)"과 "실행(deploy)" 분리와 같다. A는 역할이 뒤바뀐 설명이고, C·D는 사실과 다르다.

---

**문제 3.** API Gateway 뒤의 Lambda A가 작업의 일부를 Lambda B에 넘기려 한다. 비용·결합도·내결함성 측면에서 권장되는 구성은?

A) Lambda A가 Lambda B를 동기(RequestResponse)로 직접 호출

B) Lambda A가 SQS에 메시지를 넣고, Lambda B가 큐를 소비

C) Lambda A와 B를 하나의 거대 함수로 합침

D) Lambda A가 Lambda B를 1초마다 폴링

**정답: B**

해설: 동기 직접 호출은 A가 B를 기다리며 **이중 과금**되고, B의 장애·지연이 A로 **전파**되며, 둘의 확장이 묶인다. SQS를 끼우면 A는 메시지를 넣고 즉시 반환해 기다리지 않고(비용·타임아웃 해결), B는 자기 속도로 소비하며(독립 확장), B가 잠시 죽어도 메시지가 큐에 남는다(내결함성). 이는 생산자-소비자를 유계 버퍼로 분리하는 고전 패턴이다. A는 안티패턴, C는 단일 책임을 깨고, D는 비효율적 폴링이다.

---

**문제 4.** 하나의 주문 완료 이벤트가 발생하면 (1) 재고 시스템, (2) 이메일 발송, (3) 분석 파이프라인이 **동시에** 그 이벤트를 받아 각자 처리해야 한다. 가장 적합한 구성은?

A) SQS 하나에 세 소비자를 붙인다

B) SNS 토픽에 세 시스템(또는 각 SQS)을 구독시켜 팬아웃한다

C) Lambda가 세 시스템을 순서대로 동기 호출한다

D) DynamoDB Streams로 직접 세 곳에 쓴다

**정답: B**

해설: "한 이벤트를 여러 시스템이 **동시에**" 받는 것은 펍/섭 팬아웃이고, 이는 **SNS**의 모델이다. 각 구독자(또는 SNS→SQS→소비자)가 같은 메시지의 복사본을 받아 독립적으로 처리한다. A) SQS는 한 메시지를 한 소비자가 가져가 삭제하므로(1:1) 세 곳이 모두 받지 못한다. C) 순차 동기 호출은 결합·전파 문제가 있다. D) Streams는 테이블 변경을 흘리는 용도로 이 요구에 직접 맞지 않는다.

---

**문제 5.** SQS 표준 큐로 메시지를 받는 Lambda 소비자가, 같은 메시지를 가끔 두 번 처리해 중복 레코드가 생긴다. 근본 원인과 올바른 대응은?

A) SQS 버그이므로 AWS에 문의한다

B) 표준 큐는 at-least-once 전달이라 중복이 정상이며, 소비자를 멱등하게(예: DynamoDB 조건부 쓰기로 중복 키 무시) 만든다

C) 큐를 삭제하고 다시 만든다

D) Lambda 메모리를 늘린다

**정답: B**

해설: SQS 표준 큐는 **at-least-once(최소 한 번)** 전달을 보장하므로 같은 메시지가 두 번 이상 올 수 있다 — 이는 두 장군 문제로 인해 분산 시스템에서 "정확히 한 번 전달"이 사실상 불가능하기 때문이다. 정답은 전달을 바꾸려 하기보다 소비자를 **멱등**하게 만드는 것이다: 멱등성 키 + DynamoDB `attribute_not_exists` 조건부 쓰기로 이미 처리한 ID를 무시한다. 또는 엄격한 중복 제거가 필요하면 FIFO 큐를 쓴다. A·C·D는 원인을 오해한 대응이다.

---

**문제 6.** SAM 템플릿과 CDK가 공통으로 가지는 성질로 옳은 것은?

A) 둘 다 멀티 클라우드를 지원한다

B) 둘 다 최종적으로 CloudFormation으로 변환되어 배포된다

C) 둘 다 반드시 TypeScript로 작성한다

D) 둘 다 CloudFormation을 대체하는 별개 엔진이다

**정답: B**

해설: SAM은 `Transform` 매크로로 짧은 YAML을 긴 CloudFormation으로 펼치고, CDK는 `synth`로 프로그래밍 언어 코드를 CloudFormation 템플릿으로 합성한다 — **둘 다 종착지가 CloudFormation**이다. 차이는 입력 형태(SAM=YAML 매크로, CDK=프로그래밍 언어)와 특화(SAM=서버리스)다. A) 멀티 클라우드는 Terraform/Pulumi다. C) CDK는 여러 언어를 지원하고 SAM은 YAML이다. D) 별개 엔진이 아니라 CloudFormation 위에 올라탄다.

---

**문제 7.** 지연에 민감한 동기 REST API의 Lambda가 첫 호출에서 콜드 스타트로 느리다. 콜드 스타트를 줄이는 방법으로 적절하지 않은 것은?

A) Provisioned Concurrency로 실행 환경을 미리 워밍

B) 배포 패키지 크기를 줄여 초기화 시간 단축

C) (Java 등) SnapStart로 스냅샷에서 복원

D) Lambda A가 Lambda B를 동기로 호출하도록 변경

**정답: D**

해설: 콜드 스타트 완화책은 Provisioned Concurrency(미리 워밍된 환경 유지), SnapStart(초기화된 스냅샷에서 복원), 패키지 크기 축소다. D) Lambda 간 동기 직접 호출은 콜드 스타트와 무관할 뿐 아니라 비용·결합도·오류 전파를 키우는 **안티패턴**이라 오히려 상황을 악화시킨다. 콜드 스타트는 함수 자체의 초기화 비용 문제이지 호출 방식으로 푸는 게 아니다.
