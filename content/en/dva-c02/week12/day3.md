# Day 3 - SAM: Compressing CloudFormation for Serverless

To properly deploy a single Lambda function with CloudFormation, you need more than you'd expect. It's not just `AWS::Lambda::Function` — you need permission to invoke it (`AWS::Lambda::Permission`), an execution role (`AWS::IAM::Role`), and if API Gateway, you get RestApi, Resource, Method, Deployment, Stage all trailing along. You end up with 50-100 lines of boilerplate just for one function. Serverless's core is "small functions fast," yet the overhead of declaring that function is huge. **AWS SAM (Serverless Application Model)** directly addresses this — providing shorthand syntax specialized for serverless, then "expanding" it into complete CloudFormation at deploy time.

In DVA-C02, SAM is a frequent exam topic in Deployment domain. Simple memorization (Transform declaration mandatory, Policy Templates names) appears, but "what's SAM's relationship to CloudFormation," "what does sam local simulate and what can't it," and "why are Policy Templates safe" are more important. This article digs deep into: how SAM sits on CloudFormation as a macro, what Docker simulation `sam local` provides, how Policy Templates connect to least privilege, and what tradeoffs SAM's deployment acceleration features make.

## SAM's Identity: CloudFormation Macro

It's easy to misunderstand SAM as "a service separate from CloudFormation," but **SAM is an extension of CloudFormation (a macro)**. There's no separate deploy engine — CloudFormation takes the SAM template, transforms it into regular CloudFormation resources, then deploys. The single line that triggers this transformation is `Transform: AWS::Serverless-2016-10-31` at the template's top. With this, CloudFormation knows "this template has SAM shorthand, expand it and process."

Because `AWS::Serverless::Function` gets expanded at deploy time into Lambda function + execution role + event source + invocation permission, SAM is essentially "shorthand for commonly-used serverless combinations." Why this matters for exams: "what SAM can't do falls back to CloudFormation" — you can freely mix regular CloudFormation resources (`AWS::S3::Bucket` etc) into a SAM template. SAM doesn't replace CloudFormation; it's a convenience layer on top.

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31   # This one line turns on SAM

Globals:
  Function:
    Runtime: python3.12
    Timeout: 30
    Environment:
      Variables:
        TABLE_NAME: !Ref OrdersTable

Resources:
  CreateOrderFunction:
    Type: AWS::Serverless::Function       # Expands to Lambda+Role+Permission at deploy
    Properties:
      Handler: src/handlers/create_order.handler
      Policies:
        - DynamoDBCrudPolicy:
            TableName: !Ref OrdersTable
      Events:
        CreateOrder:
          Type: Api
          Properties: { Path: /orders, Method: POST }

  OrdersTable:
    Type: AWS::Serverless::SimpleTable
    Properties:
      PrimaryKey: { Name: orderId, Type: String }
```

| SAM Resource | Expands to CloudFormation |
|------------|--------------------------|
| `AWS::Serverless::Function` | Lambda Function + IAM Role + EventSource + Permissions |
| `AWS::Serverless::Api` | API Gateway RestApi + Deployment + Stage + Methods |
| `AWS::Serverless::HttpApi` | API Gateway V2 (HTTP API) |
| `AWS::Serverless::SimpleTable` | DynamoDB Table |
| `AWS::Serverless::StateMachine` | Step Functions |
| `AWS::Serverless::LayerVersion` | Lambda Layer |

> 💡 **Related theory**: SAM is implemented as CloudFormation **macro** mechanism. Macros are "hooks to programmatically transform templates before deploy" — exactly like compiler macros that expand code before compilation. Just as C's `#define` expands text at compile time, SAM's `Transform` expands short serverless resources into verbose CloudFormation before deploy. Because SAM is "preprocessor-as-macro," it inherits all CloudFormation features (rollback, dependency graphs, Change Set) without reinventing deployment. Clever design: layer on top without reinventing the wheel.

> ⚠️ **Trap**: Without `Transform: AWS::Serverless-2016-10-31` declaration, CloudFormation treats `AWS::Serverless::Function` as an "unknown resource type" and fails. On exams, "SAM template won't deploy / resource type unrecognized" = missing Transform as suspect #1. The date (2016-10-31) is a fixed identifier that doesn't change.

## Policy Templates: Shorthand for Least Privilege

Writing IAM roles for serverless by hand is painful and risky. Tempted to skip and slap `AdministratorAccess` or `dynamodb:*`? That breaks least privilege. Writing correctly means listing action names (`dynamodb:PutItem`, `GetItem`, `Query`...) and resource ARNs one by one. SAM's **Policy Templates** hit the middle ground — "this function needs CRUD on that table" in one line, and SAM expands it into **precise least-privilege IAM policy**.

```yaml
Policies:
  - DynamoDBCrudPolicy:        # That table only, CRUD actions only
      TableName: !Ref OrdersTable
  - S3ReadPolicy:              # That bucket read-only
      BucketName: !Ref MyBucket
  - SQSPollerPolicy:           # That queue polling permission only
      QueueName: !GetAtt MyQueue.QueueName
```

The key is Policy Template **narrows resource scope**. `DynamoDBCrudPolicy` is not `dynamodb:*` — it's only CRUD actions, and only on the specified table ARN. Declare intent, least privilege follows automatically.

> 💡 **Related theory**: Policy Templates embody security's **"secure by default"** philosophy. Design so developers taking the easiest path stay secure — using `DynamoDBCrudPolicy: { TableName: ... }` is shorter than writing `dynamodb:*` by hand, so developers naturally drift toward least privilege. Security becomes "the easiest default path" not "extra effort." Same principle lives in SAM Connector (2023) — linking two resources auto-generates needed IAM policy, removing the temptation to overly-widen permissions.

> 🔍 **Going deeper**: Policy Templates pick from a predefined list (about 100 options). If needed permission isn't there, write inline policy (`Statement`) directly or reference a managed policy ARN. And one function can mix Policy Templates with inline policies — SAM collects them all and builds that function's dedicated IAM role. That means each function gets its own role by default, naturally isolating permissions between functions.

## sam local: What Does Docker Simulate

`sam local` is powerful — "run Lambda on my laptop without AWS deploy." But knowing exactly what it simulates and what it doesn't prevents exam traps. Core: **`sam local` uses Docker containers to recreate the Lambda execution environment** — it spins up the Amazon Linux-based runtime image that Lambda actually uses, executes your function code inside it. So **Docker must be installed**.

```bash
sam build                                    # Install deps + package
sam local invoke CreateOrderFunction \
    --event events/create_order.json         # Run single function once with event
sam local start-api --port 3000              # Mimic local API Gateway, http://localhost:3000
sam logs -n CreateOrderFunction --tail       # Tail CloudWatch logs of deployed function
```

Important limits: `sam local` simulates **only the Lambda execution environment locally; other AWS services like DynamoDB, S3, SQS reach real AWS resources** (or you spin up local emulators separately). So locally running a function that writes to DynamoDB writes to real cloud DynamoDB. Not "completely offline" but "function execution local, backends real."

> ⚠️ **Trap**: "sam local isn't working" most often means Docker is uninstalled or not running. Also "works locally, fails on deploy" usually means permission difference — local runs under your developer credentials (broad), but deployed function uses its execution role (narrow from Policy Templates). What worked locally with broad permissions fails deployed with narrow permissions. "Local works, deploy fails = permission diff."

## Globals: Reducing Repetition with Shared Config

Serverless apps quickly scale to dozens of functions, all sharing runtime, timeout, environment. Repeating same settings per-function violates DRY. **Globals** section declares base defaults for Function, Api, HttpApi, SimpleTable all at once.

```yaml
Globals:
  Function:
    Runtime: python3.12
    Timeout: 30
    MemorySize: 256
    Environment:
      Variables: { LOG_LEVEL: INFO }
  Api:
    Cors: "'*'"
```

Specifying the same property again in individual resources **overrides (redefines)** Globals — most functions use default 30-second timeout, but one heavy function individually gets 300 seconds.

> 💡 **Related theory**: Globals's override rules mirror CSS cascading or config file hierarchical merge — "broader default, narrower override." But merge subtlety exists: scalars (Timeout) fully replace with individual value, but maps (environment vars) merge per-key (Globals's `LOG_LEVEL` and individual function's new var combine). This "scalars replace, maps merge" rule is shared by almost all hierarchical config systems.

## Deployment Acceleration: sam sync and Its Tradeoffs

SAM CLI offers deployment speed features, each with tradeoffs you must know for exams.

| Command/Feature | What it does | Tradeoff |
|-----------|---------|-----------|
| `sam deploy --guided` | First deploy with wizard, save to `samconfig.toml` | Later `sam deploy` alone works |
| `sam deploy` | Full CloudFormation stack deploy (safe) | Slow (CFN change set processing) |
| `sam sync --watch` | On code change, update Lambda code instantly | Fast but bypasses CFN state → **dev-only** |
| `sam pipeline init` | Generate CI/CD pipeline skeleton (CodePipeline/GitHub Actions) | — |

Core: **what does `sam sync` give up for speed?** `sam sync` skips CloudFormation when code-only changes, directly updating Lambda code in seconds. Fast, but this way **CloudFormation's view of stack state and actual function diverge**. So `sam sync` is dev-iteration fast-loop, never production. Production deploy must go through full `sam deploy` (whole CloudFormation path).

> 📚 **Case study**: SAM's safe deployment pairs CodeDeploy with **Canary/Linear deploy** automation. New Lambda version doesn't get 100% traffic at once — maybe `Canary10Percent5Minutes` sends 10% for 5 minutes while watching CloudWatch alarms, then if fine, sends rest. On alarm, auto-rollback. This progressive delivery pattern, "gradually expose new versions to limit blast radius," keeps one deploy from breaking everything. Declare via `AutoPublishAlias` + `DeploymentPreference` in SAM template.

## Summary

SAM's core: "CloudFormation macro compressing serverless boilerplate, inheriting deploy/rollback/dependency graph from CloudFormation." One `Transform` line expands `AWS::Serverless::Function` to Lambda+Role+Permission, Policy Templates make least privilege the easiest path, `sam local` Docker-simulates function execution but backends reach real AWS, Globals layer hierarchical merge to cut repetition, `sam sync` trades CFN consistency for dev speed (dev-only). CodeDeploy pairing enables Canary deploy, cutting blast radius. Exam traps mostly come from "SAM is ultimately CloudFormation" truth and "local/deploy permission diff."

Next: CDK and serverless arch patterns, where you escape YAML entirely and program infrastructure.

---

## 📝 연습 문제

**문제 1.** 작성한 SAM 템플릿을 배포하니 CloudFormation이 `AWS::Serverless::Function`을 알 수 없는 리소스 타입이라며 실패한다. 원인은?

A) Runtime이 잘못됐다

B) 템플릿에 `Transform: AWS::Serverless-2016-10-31` 선언이 빠졌다

C) Globals 섹션이 없다

D) Outputs가 없다

**정답: B**

해설: SAM 단축 리소스(`AWS::Serverless::*`)는 **`Transform: AWS::Serverless-2016-10-31`** 선언이 있어야 CloudFormation이 매크로로 펼친다. 이 선언이 없으면 CloudFormation은 SAM 리소스를 알 수 없는 타입으로 보고 실패한다. 날짜는 고정 식별자다. A) Runtime 오류는 다른 에러를 낸다. C) Globals와 D) Outputs는 선택 사항이라 없어도 배포된다.

---

**문제 2.** SAM과 CloudFormation의 관계로 가장 정확한 것은?

A) SAM은 CloudFormation과 완전히 별개의 독립 배포 엔진이다

B) SAM은 CloudFormation 매크로로, 배포 시 서버리스 리소스를 일반 CloudFormation으로 펼쳐 배포한다

C) SAM이 CloudFormation을 대체한다

D) CloudFormation이 SAM의 하위 기능이다

**정답: B**

해설: SAM은 **CloudFormation의 확장(매크로)** 이다. `Transform`이 배포 직전 SAM 리소스를 완전한 CloudFormation 리소스로 펼치며, 별도 배포 엔진이 없으므로 롤백·의존 그래프·Change Set 등 CloudFormation의 기능을 그대로 물려받는다. 그래서 SAM 템플릿에 일반 CloudFormation 리소스도 섞어 쓸 수 있다. A·C는 둘을 별개/대체로 보는 오해다. D는 관계가 거꾸로다.

---

**문제 3.** Lambda 함수에 특정 DynamoDB 테이블에 대한 CRUD 권한만 최소로 부여하려 한다. SAM에서 가장 적절한 방법은?

A) 함수에 dynamodb:* 인라인 정책을 붙인다

B) DynamoDBCrudPolicy 정책 템플릿에 TableName을 지정한다

C) AdministratorAccess 관리형 정책을 붙인다

D) 모든 함수에 같은 역할을 공유한다

**정답: B**

해설: **`DynamoDBCrudPolicy`** 정책 템플릿에 `TableName`을 주면, SAM이 그 테이블 ARN에 한정된 CRUD 액션만 가진 최소 권한 정책으로 펼쳐 함수 전용 역할에 붙인다. 의도를 한 줄로 선언하면 최소 권한이 자동으로 따라오는 "안전한 기본값" 설계다. A) `dynamodb:*`는 필요 이상으로 넓다. C) Administrator는 최소 권한 위반이다. D) 역할 공유는 권한 격리를 깨고 사고 반경을 키운다.

---

**문제 4.** `sam local start-api`로 로컬 테스트를 하려는데 실행되지 않는다. 가장 가능성 높은 원인은?

A) Outputs 섹션 누락

B) Docker가 설치/실행되어 있지 않음

C) 리전이 잘못 설정됨

D) Globals 섹션 누락

**정답: B**

해설: `sam local`은 **Docker 컨테이너로 Lambda 실행 환경을 재현**하므로 Docker가 설치되고 실행 중이어야 한다. Docker가 없으면 로컬 실행 자체가 불가능하다. A·D는 선택 섹션이라 로컬 실행을 막지 않는다. C) 리전은 실제 백엔드 호출에 영향을 줄 수 있으나 `start-api` 기동 실패의 1순위 원인은 Docker다.

---

**문제 5.** 개발 중 코드 변경을 가장 빠르게 Lambda에 반영하고 싶지만, 이 방식을 프로덕션에 쓰면 안 되는 이유까지 고려해야 한다. 적절한 명령과 주의점은?

A) sam deploy — 가장 빠르므로 프로덕션에도 그대로 사용

B) sam sync --watch — 코드만 즉시 업데이트해 빠르지만 CloudFormation 상태와 어긋날 수 있어 개발 전용

C) sam build — 코드를 자동 배포

D) sam logs — 코드를 업데이트

**정답: B**

해설: **`sam sync --watch`** 는 코드 변경 시 CloudFormation을 거치지 않고 Lambda 코드를 직접 업데이트해 수 초 만에 반영한다. 빠른 대가로 CloudFormation이 보는 스택 상태와 실제 함수가 어긋날(drift) 수 있어 **개발 전용**이며, 프로덕션은 전체 CloudFormation 경로인 `sam deploy`로 배포해야 한다. A) `sam deploy`는 안전하지만 빠른 반복용은 아니다. C) `sam build`는 패키징이다. D) `sam logs`는 로그 조회다.

---

**문제 6.** 20개 Lambda 함수가 모두 같은 런타임과 타임아웃을 쓴다. 반복 설정을 줄이되 일부 함수만 다른 타임아웃을 주고 싶다. SAM에서의 방법은?

A) 함수마다 모든 속성을 반복해서 적는다

B) Globals.Function에 공통값을 두고, 예외 함수에서 해당 속성만 재정의한다

C) Mappings를 사용한다

D) Outputs에 정의한다

**정답: B**

해설: **Globals** 섹션에 공통 기본값(Runtime, Timeout 등)을 선언하면 모든 Function에 적용되고, 개별 함수에서 같은 속성을 다시 적으면 그것이 Globals를 **재정의**한다. "넓은 기본값을 좁은 범위가 덮어쓴다"는 계층적 병합 패턴이다. A) 반복은 DRY 위반이다. C) Mappings는 조회 테이블로 공통 속성 적용 용도가 아니다. D) Outputs는 출력값이라 무관하다.

---

**문제 7.** 새 Lambda 버전 배포 시 트래픽을 한 번에 100% 보내지 않고 10%만 보내 모니터링한 뒤 문제없으면 점진적으로 늘리고, 알람 시 자동 롤백하려 한다. SAM에서의 메커니즘은?

A) Globals로 전체 트래픽 즉시 전환

B) AutoPublishAlias + DeploymentPreference(Canary)로 CodeDeploy 기반 점진 배포

C) sam local invoke

D) DeletionPolicy: Retain

**정답: B**

해설: SAM은 `AutoPublishAlias`로 함수 버전 별칭을 만들고 **`DeploymentPreference`**(예: `Canary10Percent5Minutes`)로 CodeDeploy 기반 **점진 배포(Canary/Linear)** 를 선언한다. 새 버전에 트래픽을 일부만 보내 CloudWatch 알람을 지켜보고, 정상이면 나머지를 넘기며, 알람이 울리면 자동 롤백한다. 사고 반경을 줄이는 점진 배포 패턴이다. A) 즉시 전환은 점진 배포가 아니다. C) 로컬 실행은 배포와 무관하다. D) DeletionPolicy는 삭제 보호로 무관하다.
