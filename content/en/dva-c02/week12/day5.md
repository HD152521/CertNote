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

**문제 1.** Fargate 태스크 50개를 /28 서브넷(가용 IP 약 11개) 하나에 배치하려 했더니 일부 태스크가 시작되지 않고 IP/네트워크 관련 오류가 난다. 근본 원인과 해결로 옳은 것은?

A) taskRole에 EC2 ENI 생성 권한이 없어 IP를 못 받음 — taskRole에 `ec2:CreateNetworkInterface` 추가

B) awsvpc 모드가 태스크마다 ENI/사설 IP를 소비해 서브넷 IP가 고갈됨 — 더 큰 CIDR 서브넷 추가 또는 여러 서브넷 분산

C) executionRole의 ECR pull 권한 부족으로 일부 태스크만 시작 실패 — executionRole에 ECR 권한 추가

D) 태스크 정의 리비전이 오래돼 네트워크 설정이 누락됨 — 새 리비전을 등록해 재배포

**정답: B**

해설: Fargate는 awsvpc 모드를 강제하며, 이 모드는 **태스크마다 독립 ENI와 사설 IP를 하나씩** 부여한다. 태스크 50개는 IP 50개를 요구하는데 /28 서브넷은 약 11개뿐이라 고갈된다. 해결은 더 큰 CIDR 서브넷을 쓰거나 여러 서브넷/AZ에 분산하는 것이다. A·C는 IAM 권한 문제로 IP 고갈과 무관하고, D는 환경 변수 변경 시나리오로 무관하다.

---

**문제 2.** 태스크 정의의 `secrets` 블록으로 Secrets Manager의 DB 비밀번호를 환경 변수에 주입하도록 설정했는데, 태스크가 시작조차 못 하고 비밀을 가져오지 못한다. 권한을 어디에 줘야 하나?

A) taskRole에 `secretsmanager:GetSecretValue`를 부여해 앱이 비밀을 읽게 한다

B) executionRole에 `secretsmanager:GetSecretValue`

C) Fargate에는 없는 EC2 인스턴스 프로파일에 `secretsmanager:GetSecretValue`를 추가한다

D) 권한이 아니라 Secrets Manager VPC 엔드포인트 부재로 인한 네트워크 도달성 문제다

**정답: B**

해설: 비밀을 가져와 환경 변수로 **주입하는 작업은 컨테이너가 뜨기 전, ECS 인프라(에이전트)가 수행**하므로 **executionRole**의 권한이 필요하다. taskRole은 앱이 런타임에 직접 SDK로 호출할 때 쓰인다 — 여기선 태스크가 시작도 못 했으므로 런타임 권한과 무관하다. "주입=시작 시점=executionRole"로 기억한다. 같은 Secrets Manager라도 "주입"이냐 "런타임 직접 호출"이냐로 역할이 갈린다. C) Fargate에는 EC2 인스턴스 프로파일 자체가 없다(서버리스 격리). D) 비밀 주입 실패는 전형적으로 IAM 권한 문제이지 네트워크 부재가 첫 의심 대상은 아니다.

---

**문제 3.** 사설 서브넷의 Fargate 태스크가 ECR에서 이미지를 pull하지 못한다. executionRole에는 ECR 권한이 충분하다. 다음으로 의심할 원인은?

A) 태스크 정의 리비전이 불변이라 이미지 태그가 옛 다이제스트를 가리켜 pull 실패

B) 사설 서브넷에 NAT 게이트웨이나 ECR/S3용 VPC 엔드포인트가 없어 ECR에 도달하지 못함

C) ECR 수명 주기 정책이 해당 이미지를 만료 삭제해 pull할 대상이 없음

D) taskRole에 ECR 읽기 권한이 빠져 런타임에 이미지를 못 가져옴

**정답: B**

해설: 권한이 충분한데도 pull이 안 되면 **네트워크 도달성** 문제다. 사설 서브넷의 태스크가 ECR(및 이미지 레이어가 저장된 S3)에 도달하려면 NAT 게이트웨이(인터넷 경유) 또는 ECR·S3 VPC 엔드포인트(프라이빗 경로)가 필요하다. 둘 다 없으면 "이미지 pull 실패"가 난다. A는 무관, C는 이미지가 실제로 없을 때의 별개 문제, D는 런타임 권한이라 pull과 무관하다. "권한 OK인데 pull 실패=네트워크"로 분기한다.

---

**문제 4.** CloudFormation으로 운영 중인 스택을 업데이트하려는데, RDS 인스턴스가 의도치 않게 교체(replacement)되어 데이터가 날아갈까 걱정된다. 적용 전에 어떤 자원이 어떻게 바뀌는지 확인하려면?

A) 바로 update-stack을 실행하고 롤백 트리거에 의존해 문제 시 자동 복구한다

B) Change Set을 생성해 추가·수정·삭제·교체될 자원 목록을 검토한 뒤 적용

C) Drift Detection을 실행해 적용 후 바뀔 자원을 미리 감지한다

D) 스택을 삭제하고 다시 생성해 깨끗한 상태에서 원하는 구성을 만든다

**정답: B**

해설: **Change Set**은 업데이트를 실제 적용하기 **전에** 어떤 자원이 추가·수정·삭제·**교체(replacement)** 될지 미리 보여준다. RDS 같은 상태 저장 자원의 교체는 데이터 손실로 이어질 수 있으므로, Change Set 검토로 사람이 위험을 사전에 잡는다. A는 미리보기 없이 위험을 감수하는 것, C) Drift는 "이미 배포된 것과 실제의 차이"를 감지하는 별개 기능(미래 변경 미리보기가 아님), D는 데이터를 확실히 날린다.

---

**문제 5.** 스택을 삭제하더라도 그 안의 S3 버킷(중요 데이터 보관)만은 삭제되지 않고 남기를 원한다. 어떻게 설정하나?

A) 스택에 Termination Protection을 켜서 스택 삭제 시 버킷이 보존되게 한다

B) 해당 S3 버킷 자원에 `DeletionPolicy: Retain` 설정

C) Stack Policy로 S3 버킷 자원을 Deny 대상에 넣어 삭제로부터 보호한다

D) Drift Detection을 켜서 버킷이 삭제되려 하면 차이를 감지해 막는다

**정답: B**

해설: **DeletionPolicy: Retain**은 **자원 단위**로 "스택이 삭제돼도 이 자원은 남긴다"를 지정한다. 데이터가 중요한 S3·RDS 등에 흔히 쓴다. A) Termination Protection은 **스택 자체**의 삭제를 막는 것(자원 단위가 아님)으로 목적이 다르다. C) Stack Policy는 업데이트 중 자원 보호이고, D) Drift는 차이 감지로 무관하다. "자원만 남김=DeletionPolicy, 스택 삭제 자체 차단=Termination Protection"으로 가른다.

---

**문제 6.** 한 SAM 템플릿을 배포하려는데 `Transform` 선언이 빠져 일반 CloudFormation으로 처리되며 `AWS::Serverless::Function`을 알 수 없는 자원 타입이라 거부한다. 무엇이 필요한가?

A) Parameters 섹션을 추가해 Serverless 자원 타입을 파라미터로 선언한다

B) 템플릿 최상위에 `Transform: AWS::Serverless-2016-10-31` 선언

C) Globals 섹션을 추가해 함수 공통 속성을 정의하면 타입이 인식된다

D) Outputs 섹션에 함수 ARN을 내보내면 자원 타입이 등록된다

**정답: B**

해설: SAM은 CloudFormation **매크로**이고, `Transform: AWS::Serverless-2016-10-31` 선언이 "이 짧은 SAM 문법을 긴 CloudFormation으로 펼쳐라"라고 엔진에 지시한다. 이 선언이 없으면 CloudFormation은 `AWS::Serverless::*` 자원을 인식하지 못한다. A·C·D는 선택적 섹션으로 이 오류와 무관하다. "SAM=Transform 필수"는 단독으로도 출제되는 핵심이다.

---

**문제 7.** 주문 완료 이벤트 하나가 발생하면 재고·이메일·분석 세 시스템이 **동시에** 각자 처리해야 하고, 각 소비자는 일시적 폭주를 버틸 버퍼와 실패 격리가 필요하다. 가장 적합한 구성은?

A) SQS 큐 하나에 재고·이메일·분석 세 소비자를 붙여 같은 메시지를 셋 다 받게 한다

B) SNS 토픽 → 세 개의 SQS 구독(각 SQS에 소비자 + DLQ)으로 팬아웃

C) 주문 Lambda가 재고·이메일·분석 시스템을 순차로 동기 호출하고 실패 시 재시도한다

D) EventBridge 스케줄 규칙으로 주기적으로 세 시스템에 주문 이벤트를 전달한다

**정답: B**

해설: "한 이벤트를 여러 시스템이 동시에" 받는 건 SNS 팬아웃이고, 각 구독을 **SQS로 받으면** 소비자별 버퍼·재시도·DLQ(실패 격리)가 생긴다. SNS가 Lambda를 직접 구독하는 것보다 SNS→SQS→소비자가 폭주 흡수와 유실 방지에 강하다. A) SQS는 1:1이라 한 메시지를 한 소비자만 가져가 세 곳이 모두 못 받는다. C) 순차 동기 호출은 결합·전파 문제, D) 스케줄은 이 요구와 무관하다.

---

**문제 8.** SQS 표준 큐를 소비하는 결제 처리 Lambda가 같은 메시지를 가끔 두 번 처리해 이중 결제가 발생한다. 올바른 근본 대응은?

A) SQS를 신뢰할 수 없으니 SNS로 교체

B) 표준 큐는 at-least-once라 중복이 정상이므로, 멱등성 키 + DynamoDB 조건부 쓰기(`attribute_not_exists`)로 소비자를 멱등하게 만들거나 FIFO 큐 사용

C) Lambda 동시성을 1로 제한

D) 메시지 크기를 줄임

**정답: B**

해설: SQS 표준 큐는 **at-least-once** 전달이라 같은 메시지가 두 번 올 수 있다(두 장군 문제로 "정확히 한 번 전달"이 불가능). 결제처럼 중복이 치명적이면 소비자를 **멱등**하게 만들어야 한다 — 멱등성 키로 이미 처리한 요청을 식별하고 DynamoDB 조건부 쓰기로 중복을 무시한다. 또는 "정확히 한 번 처리"를 보장하는 **FIFO 큐**를 쓴다. A는 모델이 더 안 맞고, C는 성능을 죽이며 근본 해결도 아니고, D는 무관하다.

---

**문제 9.** API Gateway 뒤 Lambda A가 무거운 후처리를 Lambda B에 넘긴다. 현재 A가 B를 동기 호출하는데 비용이 높고, B가 느려지면 API 응답이 타임아웃난다. 개선안은?

A) B의 메모리·타임아웃을 늘려 더 빨리 끝나게 하고 동기 호출 구조는 유지한다

B) A가 SQS에 작업을 넣고 즉시 응답, B가 큐를 비동기로 소비

C) A와 B를 하나의 큰 Lambda로 합쳐 호출 간 오버헤드와 이중 과금을 없앤다

D) A가 B를 비동기로 트리거한 뒤 결과가 나올 때까지 1초 간격으로 상태를 폴링한다

**정답: B**

해설: 동기 호출은 A가 B를 기다리며 **이중 과금**되고 B의 지연이 API 타임아웃으로 전파된다. A가 SQS에 작업을 넣고 즉시 반환하면 사용자는 빠른 응답을 받고, B는 자기 속도로 큐를 비워 독립 확장되며, B 장애 시에도 메시지가 보존된다(생산자-소비자를 유계 버퍼로 분리). A는 근본 문제(결합·과금)를 안 풀고, C는 단일 책임을 깨고, D는 비효율적이다.

---

**문제 10.** CDK로 작성한 인프라를 새 AWS 계정의 ap-northeast-2 리전에 처음 배포하려 하자 자산 업로드용 버킷이 없다는 류의 오류가 난다. 먼저 무엇을 해야 하나?

A) cdk synth를 다시 실행해 자산 버킷 정의가 포함된 템플릿을 재생성한다

B) 해당 계정·리전에 `cdk bootstrap` 1회 실행해 배포용 S3·ECR·IAM 발판을 구성

C) cdk destroy로 잔여 스택을 정리한 뒤 깨끗한 상태에서 다시 deploy한다

D) CloudFormation 콘솔에서 자산용 S3 버킷 스택을 수동 생성한 뒤 deploy한다

**정답: B**

해설: CDK는 배포 시 Lambda zip·Docker 이미지 같은 자산을 올려둘 S3·ECR과 배포용 IAM 역할이 필요하고, `cdk bootstrap`이 이 발판을 **계정·리전 조합마다 1회** 깐다. 새 계정/리전이라면 bootstrap이 선행돼야 한다. A) synth는 템플릿 생성일 뿐 발판을 안 만들고, C) destroy는 삭제, D) 수동 생성은 CDK 워크플로가 아니다.

---

**문제 11.** ap-northeast-2의 네트워크 스택이 Export한 VPC ID를, us-east-1의 다른 스택에서 `!ImportValue`로 가져오려 했더니 동작하지 않는다. 이유는?

A) `!ImportValue` 구문에 Export 이름을 잘못 적은 문법 오류 때문

B) !ImportValue는 같은 리전 내 스택 간 Export/Import만 지원하며 cross-region 참조가 불가능하기 때문

C) VPC ID는 Export 대상에서 제외되는 자원 타입이라 애초에 Import할 수 없어서

D) 가져오는 스택의 실행 역할에 us-east-1 자원 접근 권한이 없어서

**정답: B**

해설: `!ImportValue`(및 Export)는 **같은 리전 안의** 스택끼리만 값을 주고받는다 — cross-region·cross-account 참조를 지원하지 않는다. 리전을 가로질러 값을 공유하려면 SSM Parameter Store 같은 다른 메커니즘을 써야 한다. A는 문법 문제로 단정할 수 없고, C) VPC ID는 Export 가능하며, D는 무관하다. "ImportValue=동일 리전 한정"은 단독 출제 포인트다.

---

**문제 12.** 같은 CloudFormation 템플릿을 동일 환경에 두 번 연속 적용했는데, 두 번째 적용에서 아무 변경도 발생하지 않고 자원이 그대로다. 이 동작의 근거는?

A) CloudFormation이 동일 템플릿을 캐싱해 두 번째 적용을 건너뛰는 버그 때문

B) CloudFormation은 선언적 모델이라 "원하는 상태"와 현재 상태가 같으면 변경할 게 없어 멱등하게 동작함

C) 두 번째 적용 시 Change Set이 빈 변경 집합을 만들어 업데이트를 차단했기 때문

D) Termination Protection이 켜져 있어 두 번째 적용의 변경이 막혔기 때문

**정답: B**

해설: CloudFormation은 **선언적**이라 "목표 상태"를 선언하면 현재 상태와의 차이만 적용한다. 이미 목표 상태에 도달했다면 두 번째 적용은 적용할 차이가 없어 아무것도 바꾸지 않는다 — 이것이 **멱등성**이다(같은 입력을 여러 번 적용해도 결과가 한 번 적용한 것과 같음). 명령적 스크립트라면 두 번 실행 시 부작용이 누적될 수 있지만, 선언적 IaC는 그렇지 않다. A는 정상 동작을 오해한 것이고, C·D는 이 동작의 원인이 아니다.

---
