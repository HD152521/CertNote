# Day 37 - Step Functions: 분산 워크플로우의 상태 모델과 Saga 패턴

Lambda 함수를 처음 한두 개 만들어 쓰다 보면, 어느 순간 "이걸 순서대로 묶고, 실패하면 보상하고, 외부 승인을 기다리고 싶다"는 요구가 생긴다. 처음에는 한 Lambda가 다른 Lambda를 호출하는 방식으로 풀고 싶어진다. 그러나 그 순간부터 함수 chain의 timeout(15분), 실패 시 어느 단계에서 멈췄는지 모르는 가시성 문제, 재시도와 보상 로직이 코드 안에 흩어지는 유지보수 문제가 한꺼번에 생긴다.

Step Functions는 이 모든 문제를 "**상태 머신을 인프라로 만든다**"는 방식으로 푼다. 워크플로우의 각 단계는 state가 되고, 전이는 선언적 JSON(ASL — Amazon States Language)으로 표현된다. AWS는 그 상태를 영속적으로 저장하고, 실패하면 정확히 어느 상태에서 멈췄는지 보여주고, 보상 분기를 매니지드로 실행한다. SAP 시험에서 "장기 워크플로우", "Saga", "여러 서비스 오케스트레이션" 키워드가 나오면 거의 Step Functions가 답이다.

## 왜 상태 머신을 인프라로 만드는가 — 분산 시스템의 본질적 어려움

여러 마이크로서비스를 묶는 워크플로우는 본질적으로 **분산 트랜잭션** 문제다. 결제 → 재고 차감 → 배송 예약 같은 시퀀스는 모든 단계가 성공하거나 모두 롤백되어야 한다. 모놀리식 DB라면 단일 트랜잭션으로 처리 가능하지만, 각 단계가 다른 서비스(다른 DB, 다른 팀, 다른 운영 주기)에 걸쳐 있으면 2PC(Two-Phase Commit) 같은 ACID 모델은 불가능하다.

해결책으로 1987년 Hector Garcia-Molina와 Kenneth Salem의 "Sagas" 논문이 제시한 패턴이 바로 **Saga**다. 핵심 아이디어:
1. 분산 트랜잭션을 작은 로컬 트랜잭션 N개로 분할
2. 각 로컬 트랜잭션은 보상 트랜잭션(Compensating Transaction)을 가짐
3. 어느 단계에서 실패하면 이전 단계들의 보상 트랜잭션을 역순으로 실행

Saga는 ACID가 아니라 **eventual consistency**를 받아들이는 대신, 가용성과 확장성을 얻는다. Step Functions의 Catch + 별도 보상 분기 패턴이 정확히 Saga의 코드 매니페스테이션이다.

> 💡 **관련 이론**: Saga의 변형으로 **Orchestration 기반**(중앙 조정자가 단계를 순차 호출)과 **Choreography 기반**(서비스가 이벤트로 자율 협력) 두 가지가 있다. Step Functions는 전형적 Orchestration 모델이고, EventBridge 기반은 Choreography 모델이다. 일반적으로 5단계 이하 단순 흐름은 Choreography가 가볍고, 그 이상 또는 인간 승인이 끼는 흐름은 Orchestration이 가시성과 디버깅에서 우월하다. Chris Richardson의 *Microservices Patterns* 책 4장이 가장 권장되는 참고 자료.

> 🔍 **더 깊이**: Step Functions 내부는 **distributed durable state machine**으로 구현되어 있다. 모든 state transition은 AWS 내부 분산 KV에 기록되고, 복원 가능하다. 즉 워크플로우 실행 중에 AZ 하나가 다운돼도 다른 AZ에서 정확히 멈춘 지점부터 재개된다. 사용자는 이 영속성을 무료로 얻는다. 이 모델은 Microsoft의 Durable Functions, Temporal.io(Uber Cadence 후속), Netflix Conductor와 같은 카테고리에 속한다. 차이는 Step Functions가 AWS 서비스 통합(200+ 직접 호출)과 IAM 통합에서 압도적이라는 점.

## Standard vs Express — 같은 추상화의 다른 가격 모델

Step Functions는 같은 ASL 언어를 쓰지만 두 가지 실행 모드로 갈린다.

| 항목 | Standard | Express |
|------|----------|---------|
| 최대 실행 시간 | 1년 | 5분 |
| 가격 모델 | **상태 전이당**($25/M 전이) | **호출 횟수 + 실행 시간**(Lambda와 유사) |
| 실행 이력 보존 | 90일 (모든 상태 보존) | CloudWatch Logs only |
| 정확히 1회(at-most-once) | At-least-once + idempotent 보장 | Async: at-most-once / Sync: at-least-once |
| 사용 사례 | 주문 처리, ETL, 머신러닝 파이프라인, 사람 승인 | IoT 이벤트 처리, 마이크로서비스 oneshot, API backend |
| 가시성 | 콘솔에 전체 실행 그래프 + 상태 시각화 | CloudWatch Logs 기반 (실행 그래프 없음) |

Express는 2019년 출시됐고, 단가가 Standard의 100분의 1 수준이다. 짧고 빠른 워크플로우를 매우 자주 실행하는 패턴에 맞춰졌다. 한 번에 1000건 이상의 동시 실행이 정상이라면 Express, 며칠짜리 장기 워크플로우라면 Standard.

> ⚠️ **함정**: "한 워크플로우의 비용 효율은 항상 Express가 좋다"는 보기는 오답이다. Express는 호출당·시간당 과금이므로 **드물게 실행되지만 긴 워크플로우**에서는 오히려 Standard보다 비싸진다. 시험 시나리오의 두 축은 (1) 실행 시간이 5분 안에 끝나는가, (2) 호출 빈도가 매우 높은가다. 둘 다 yes면 Express, 그 외엔 Standard.

> 📚 **사례**: 2021년 Coca-Cola의 IoT 파이프라인은 자판기에서 초당 수천 건의 이벤트(판매, 재고 변화, 온도 알림)를 처리한다. 처음엔 Standard로 시작했다가 상태 전이 비용이 월 수만 달러로 치솟아 Express로 전환해 90% 이상 절감했다. AWS re:Invent 2022 발표. 핵심 교훈은 "고빈도·짧음"이 Express의 정확한 sweet spot이라는 것.

## State 종류와 ASL 모델

ASL은 7개 핵심 state로 워크플로우를 표현한다.

| State | 역할 | 시험 출제 빈도 |
|-------|------|----------------|
| **Task** | Lambda·서비스 API 호출 | 매우 높음 |
| **Choice** | 조건 분기 (if/switch) | 높음 |
| **Parallel** | 고정된 N개 분기 동시 실행 | 보통 |
| **Map** | 배열을 동적으로 병렬 처리 | 매우 높음 |
| **Wait** | 시간/타임스탬프 대기 | 보통 |
| **Pass** | 입력을 그대로 전달 (테스트) | 낮음 |
| **Succeed/Fail** | 종료 상태 | 보통 |

여기서 **Map** state는 2022년 **Distributed Map**으로 확장되면서 시험 출제가 늘었다. 표준 Map은 인라인 모드로 동시 40개 제한, 동일 실행 컨텍스트 안에서 동작한다. Distributed Map은:
- 최대 **10,000 child execution** 병렬
- S3 객체 list, CSV, JSON Lines를 직접 source로 사용
- 각 child execution이 독립 실행이라 ASL 페이로드 크기 한도(256KB)를 우회

> 🎯 **시나리오**: "한 미디어 회사가 S3에 저장된 100만 개의 동영상 파일을 일괄 트랜스코딩한다. 각 파일당 ECS Fargate Task로 처리한다. 어떤 패턴이 가장 적합한가?" — 답은 **Step Functions Distributed Map + ECS RunTask(.sync)**. S3 source를 직접 읽어 1만 병렬 child execution을 띄우고, 각 execution이 ECS Task를 동기 대기. 표준 Map은 동시 40개 제한이라 100만 개를 처리하는 데 너무 느림. Lambda 함수로 직접 loop를 도는 건 페이로드 한도와 가시성 부족 문제로 부적합.

## 서비스 통합 패턴 3종

Step Functions는 200+개의 AWS 서비스 API를 직접 호출할 수 있다. 호출 방식은 3가지로 갈린다.

```
[Step Functions Task]
   ├── Request-Response (default): 호출하고 즉시 다음 state로
   ├── .sync:                       Job 완료까지 동기 대기 + polling
   └── .waitForTaskToken:           외부 시스템 콜백으로 진행
```

### Request-Response — 단순 호출

`arn:aws:states:::lambda:invoke` 같은 기본 형태. Lambda를 호출하고 응답을 받으면 즉시 다음 state로 넘어간다. ECS RunTask를 이 모드로 호출하면 Task를 시작만 하고 완료를 안 기다리고 넘어간다(보통 원하는 동작이 아님).

### .sync — Job 완료까지 동기 대기

`arn:aws:states:::ecs:runTask.sync`처럼 `.sync` suffix를 붙이면 Step Functions가 내부적으로 polling하면서 Job 완료까지 기다린다. ECS RunTask, EMR Step, Glue Job, SageMaker Training/Transform 등 "오래 걸리는 작업"에 쓴다. 사용자는 polling 코드를 안 짜도 된다.

내부 동작은 IAM Role에 `iam:PassRole` + 추가로 `events:PutTargets`·`events:PutRule` 권한이 필요한데, Step Functions가 ECS Task의 완료 이벤트를 EventBridge로 받기 위함이다. 시험에서 "Step Functions이 ECS RunTask.sync로 실행이 안 된다"는 시나리오의 원인은 거의 IAM 권한 누락이다.

### .waitForTaskToken — 외부 콜백 대기

가장 강력한 패턴. Step Functions가 Task에 **token**을 발급하고, 외부 시스템(사람, 다른 시스템)이 그 token을 가지고 `SendTaskSuccess`/`SendTaskFailure` API를 호출할 때까지 워크플로우가 멈춰서 대기한다.

전형적 사용 사례:
- **인간 승인**: 워크플로우가 SNS로 승인 요청 이메일 발송 + token 포함. 사람이 링크 클릭 → API GW → Lambda → `SendTaskSuccess`
- **외부 시스템 연동**: 결제 게이트웨이가 비동기로 결과를 webhook으로 보낼 때
- **장기 대기 잡**: 며칠씩 걸리는 외부 처리 결과 대기

```json
{
  "Type": "Task",
  "Resource": "arn:aws:states:::sns:publish.waitForTaskToken",
  "Parameters": {
    "TopicArn": "arn:aws:sns:...:approval",
    "Message.$": "$",
    "MessageAttributes": {
      "TaskToken": { "DataType": "String", "StringValue.$": "$$.Task.Token" }
    }
  }
}
```

> 🔍 **더 깊이**: `.waitForTaskToken`이 Standard에서만 동작하는 이유는 Express의 단일 실행 시간 한도(5분) 때문이다. Standard는 1년까지 기다릴 수 있어 며칠짜리 승인 워크플로우도 자연스럽게 구현된다. token은 64KB의 opaque 문자열이고, AWS가 워크플로우 인스턴스를 영속 저장하는 분산 KV에 매핑되어 있다. 즉 Step Functions의 워크플로우 인스턴스 자체가 **first-class object**라는 점이 이 패턴을 가능하게 한다.

> 📚 **사례**: 2020년 Capital One은 신용카드 발급 워크플로우를 Step Functions로 전환하면서 "수동 신용 심사 단계"를 `.waitForTaskToken`으로 구현했다. 시스템이 자동 심사를 시도하다 임계치 미만이면 사람 검토자에게 token을 발송하고, 검토자가 결정을 입력하면 워크플로우가 재개된다. 평균 대기 시간은 며칠. 이전에는 별도 큐 + 폴링 서비스를 직접 운영했지만, Step Functions로 단순화하면서 코드 80% 감소를 보고했다.

## Error Handling — Retry와 Catch의 협업

ASL의 에러 처리는 두 레이어로 갈린다.

**Retry** — 같은 state를 재실행
```json
"Retry": [{
  "ErrorEquals": ["Lambda.ServiceException", "Lambda.AWSLambdaException"],
  "IntervalSeconds": 2,
  "MaxAttempts": 3,
  "BackoffRate": 2.0,
  "JitterStrategy": "FULL"
}]
```

`BackoffRate=2.0`이면 2초, 4초, 8초로 지수 백오프. `JitterStrategy=FULL`(2023)을 켜면 jitter가 추가되어 동시 호출의 thundering herd를 피한다.

**Catch** — 다른 state로 분기
```json
"Catch": [{
  "ErrorEquals": ["States.ALL"],
  "ResultPath": "$.error",
  "Next": "CompensateAndCleanup"
}]
```

Catch는 보상 분기(Saga의 보상 트랜잭션)에 쓴다. `ResultPath`로 에러 정보를 워크플로우 입력에 보존하면, 보상 단계가 어디서 무엇이 실패했는지 알 수 있다.

> 💡 **관련 이론**: 지수 백오프 + jitter는 분산 시스템의 표준 패턴이다. AWS 블로그 "Exponential Backoff And Jitter"(2015)가 가장 짧고 명확한 설명. 핵심 통찰은 "재시도하는 클라이언트가 많으면 모두 같은 시간에 다시 몰려와 thundering herd가 생기므로, jitter로 분산해야 한다"는 것. Step Functions의 JitterStrategy는 이를 매니지드로 구현. 2023년 추가된 기능.

## Saga의 실전 구현 — 주문 처리 예시

```
[ReserveInventory] ── 실패 ──► [CancelOrder]
       │ 성공
       ▼
[ChargePayment] ──── 실패 ──► [RestoreInventory] ──► [CancelOrder]
       │ 성공
       ▼
[CreateShipment] ─── 실패 ──► [RefundPayment] ──► [RestoreInventory] ──► [CancelOrder]
       │ 성공
       ▼
[NotifyCustomer]
```

각 단계의 Catch가 보상 체인을 호출하는 구조. ASL로 표현하면:

```json
{
  "ChargePayment": {
    "Type": "Task",
    "Resource": "arn:aws:states:::lambda:invoke",
    "Parameters": { "FunctionName": "ChargePaymentFn", "Payload.$": "$" },
    "Retry": [{
      "ErrorEquals": ["PaymentGatewayTransient"],
      "MaxAttempts": 3, "BackoffRate": 2.0
    }],
    "Catch": [{
      "ErrorEquals": ["States.ALL"],
      "ResultPath": "$.error",
      "Next": "RestoreInventory"
    }],
    "Next": "CreateShipment"
  }
}
```

핵심은 **보상 트랜잭션이 idempotent**해야 한다는 점. 같은 보상 호출이 두 번 들어와도 결과가 동일해야 한다. `idempotencyKey`를 입력에 포함시키는 패턴이 보통.

> ⚠️ **함정**: "Step Functions가 ACID 트랜잭션을 보장한다"는 보기는 오답. Saga는 BASE(Basically Available, Soft state, Eventual consistency) 모델이다. 보상 트랜잭션 자체가 실패할 가능성도 있어 모니터링·알람·수동 개입 절차가 필요하다. 시험에서는 보통 "Saga로 보상을 구현"이라는 표현이 정답 키워드.

## Distributed Map — 대규모 데이터 처리

2022년 추가된 Distributed Map은 표준 Map의 동시 40개 제한을 깨고 **10,000 child execution**까지 병렬 처리한다.

```json
{
  "ProcessAllFiles": {
    "Type": "Map",
    "ItemReader": {
      "Resource": "arn:aws:states:::s3:listObjectsV2",
      "Parameters": { "Bucket": "input-bucket", "Prefix": "data/" }
    },
    "MaxConcurrency": 1000,
    "ItemProcessor": {
      "ProcessorConfig": { "Mode": "DISTRIBUTED", "ExecutionType": "EXPRESS" },
      "StartAt": "Process",
      "States": {
        "Process": {
          "Type": "Task",
          "Resource": "arn:aws:states:::lambda:invoke",
          "End": true
        }
      }
    },
    "ResultWriter": {
      "Resource": "arn:aws:states:::s3:putObject",
      "Parameters": { "Bucket": "output-bucket", "Prefix": "results/" }
    }
  }
}
```

특징:
- **ItemReader**: S3 list, CSV, JSON Lines를 직접 source로
- **Child execution**: Standard 또는 Express. Express 추천(가격·속도)
- **ResultWriter**: 결과를 자동으로 S3에 집계
- **MaxConcurrency**: 동시 실행 한도 (10,000까지)

> 🎯 **시나리오**: "한 데이터팀이 매일 100만 개의 CSV 행을 처리하는 ETL을 운영한다. 각 행은 독립적이고 Lambda 1회 호출로 처리된다. 가장 비용 효율적이고 운영 부담이 적은 구성은?" — 답은 **Distributed Map + Lambda(Express 모드 child)**. ECS Batch를 쓰면 컨테이너 부팅 비용이 크고, Lambda loop는 페이로드 한도와 가시성 부족 문제. Distributed Map은 100만 행을 자동으로 chunk(예: 100 rows/chunk)로 나누고 Lambda를 1만 개 병렬로 호출. 비용은 상태 전이 비용 + Lambda 호출 비용으로 매우 낮음.

## Step Functions vs Glue Workflows vs EventBridge Pipes — 비슷해 보이는 셋의 진짜 차이

시험에서 자주 혼동되는 세 서비스의 분기:

| 도구 | 본질 | 사용 시점 |
|------|------|----------|
| **Step Functions** | 범용 워크플로우 엔진 | 복잡 분기·병렬·보상·외부 콜백 |
| **Glue Workflows** | ETL 전용 워크플로우 | Crawler + Job + Trigger 시퀀스 (Spark 기반) |
| **EventBridge Pipes** | 단일 source→target 파이프 | 1:1 라우팅 + 필터·변환 (코드 없이) |

Pipes는 다음 day의 주제다. 핵심만 미리 보면, "SQS 큐 → 필터 → Step Functions" 같은 단일 연결을 Lambda 코드 없이 구성하는 도구. 복잡한 흐름이 아니라면 Pipes가 더 가볍다.

> 📚 **사례**: 2023년 Airbnb는 결제 환불 워크플로우(7단계 + 4개의 외부 시스템 + 인간 승인)를 자체 워크플로우 엔진에서 Step Functions Standard로 마이그레이션했다. 가장 큰 효과는 가시성(전체 실행이 콘솔에서 시각화)과 IAM 통합(단계별 최소 권한)이라고 발표. 자체 엔진 유지보수에 들어가던 SRE 인력 2명을 다른 업무로 재배치할 수 있었다.

## ASL 입력/출력 가공 — InputPath, ResultPath, OutputPath

ASL의 헷갈리는 부분 중 하나가 state 간 데이터 흐름 가공이다. 4가지 path가 협력한다:

1. **InputPath** — state에 들어올 데이터에서 추출할 부분
2. **Parameters** — Task에 전달할 데이터를 재구성
3. **ResultSelector** + **ResultPath** — Task의 결과를 가공·삽입
4. **OutputPath** — 다음 state로 보낼 데이터 추출

```
입력 → InputPath 필터 → Parameters 재구성 → Task 실행 → 
ResultSelector 가공 → ResultPath 삽입 → OutputPath 필터 → 다음 state
```

> 🔍 **더 깊이**: 이 4-단계 가공이 처음엔 복잡해 보이지만, 핵심은 **immutable transformation pipeline**이다. 함수형 프로그래밍의 `map`/`filter`/`pipe`와 같은 발상. 시험에서는 직접 ASL을 쓰라고 묻지 않지만, "State A의 결과를 State B에 일부만 전달하려면" 같은 시나리오가 가끔 나온다. ResultSelector + ResultPath가 답.

## Workflow Studio — 비주얼 워크플로우 빌더

2021년 추가된 Workflow Studio는 드래그 앤 드롭으로 워크플로우를 만들고 ASL JSON을 자동 생성한다. 200+ 서비스 통합이 카탈로그로 제공되고, IAM 정책도 자동 생성. 작은 워크플로우에는 손코딩보다 훨씬 빠르고 실수가 적다.

큰 워크플로우는 ASL JSON을 직접 작성하고 CDK/Terraform으로 관리하는 게 일반적이다. Workflow Studio에서 비주얼로 생성 후 export → 코드 베이스에 commit하는 hybrid 워크플로우도 흔하다.

## 정리하며

Step Functions는 단순한 "Lambda 호출 체인"이 아니다. 분산 시스템의 영속 상태 머신, Saga 보상 트랜잭션, 외부 콜백 대기, 대규모 병렬 처리 같은 패턴을 매니지드로 제공한다. 시험에서는 시나리오 키워드를 다음과 같이 매핑하면 거의 맞는다:

- "장기 워크플로우 + 보상" → **Standard + Catch/Compensate**
- "고빈도·짧음" → **Express**
- "인간 승인 / 외부 콜백" → **.waitForTaskToken**
- "ECS Task 완료까지 대기" → **.sync**
- "S3 100만 객체 병렬 처리" → **Distributed Map + Express child**

다음 day에서는 EventBridge로 이벤트 라우팅을 본다. Step Functions가 "흐름"의 도구라면 EventBridge는 "분배"의 도구다. 두 도구가 함께 쓰이는 패턴이 SAP 시험에서 가장 자주 등장한다.

---

## 📝 연습 문제

**문제 1.** 한 IoT 플랫폼이 자판기에서 초당 5,000건의 이벤트(판매·재고·온도)를 받는다. 각 이벤트당 워크플로우는 평균 30초이고 4단계로 끝난다. 가장 비용 효율적인 Step Functions 구성은?

A) Standard
B) Express
C) Standard with Distributed Map
D) Lambda chain without Step Functions

**정답: B**
해설: 초당 5,000건의 고빈도 + 5분 안에 끝나는 짧은 워크플로우는 Express의 정확한 sweet spot. Standard는 상태 전이당 과금($25/M)이라 초당 5,000건×4단계×3,600×24×30 = 월 5조 전이로 천문학적 비용. Express는 호출 + 시간당 과금으로 100분의 1 수준. C(Distributed Map)는 단일 워크플로우 안에서 병렬이 필요할 때이고, 이 시나리오는 워크플로우 인스턴스 자체가 많은 것. D(Lambda chain)는 가시성·재시도·보상 처리가 코드로 흩어져 운영 부담이 큼. 추가: Coca-Cola, Snap 등 IoT 사례는 모두 Express + S3 archive 패턴이 표준.

---

**문제 2.** 결제 → 재고 차감 → 배송 예약 워크플로우에서 배송 예약이 실패하면 결제 환불 + 재고 복원이 필요하다. 가장 적합한 패턴은?

A) Lambda chain + try/catch in code
B) Step Functions Standard + Catch + 보상 분기
C) EventBridge Rule chain
D) SQS DLQ로 실패 이벤트 격리

**정답: B**
해설: 분산 트랜잭션의 보상은 Saga 패턴이고, Step Functions에서는 각 Task의 Catch가 별도 보상 state로 분기하는 형태로 구현. A는 보상 로직이 코드에 흩어져 가시성과 유지보수가 어렵고, Lambda 15분 timeout도 제약. C(EventBridge chain)는 가능하지만 워크플로우 인스턴스 추적과 영속 상태가 없음. D는 실패 격리이지 보상이 아님. Standard를 쓰는 이유는 보상 워크플로우가 며칠 걸릴 수 있고, 1년까지 실행 가능하기 때문. 추가: 보상 트랜잭션은 idempotent해야 하고, `idempotencyKey`를 입력에 포함시키는 패턴이 표준.

---

**문제 3.** 결제 워크플로우에서 외부 결제 게이트웨이가 비동기로 webhook으로 결과를 보낸다. 워크플로우는 그동안 대기해야 한다. 어떤 통합 패턴?

A) Wait State (10분)
B) .sync (서비스 통합)
C) .waitForTaskToken
D) Lambda polling loop

**정답: C**
해설: `.waitForTaskToken`은 Task에 token을 발급하고 외부 시스템이 `SendTaskSuccess`/`SendTaskFailure`를 호출할 때까지 워크플로우가 영속 상태로 대기하는 패턴. webhook receiver(Lambda)가 token을 받아 호출하면 워크플로우가 재개. A(Wait)는 시간 기반이라 외부 응답 시점이 불확실하면 부적합. B(.sync)는 AWS 서비스 통합(ECS/EMR/Glue 등)의 Job 완료 대기. D는 polling 비용·복잡도 증가. 함정: 인간 승인도 같은 패턴(.waitForTaskToken + SNS 이메일). 추가: Standard만 지원, Express는 5분 한도라 미지원.

---

**문제 4.** S3에 저장된 100만 개의 CSV 파일을 각각 Lambda로 처리한다. 가장 적합한 패턴은?

A) Map state (인라인 모드)
B) Distributed Map + Express child execution
C) Lambda inside Lambda loop
D) ECS Batch with 1M tasks

**정답: B**
해설: 표준 Map은 동시 40개 제한, Distributed Map은 10,000 병렬 + ItemReader로 S3 list 직접 가능. Express child execution으로 비용·속도 최적화. A는 동시 40개라 100만 처리에 너무 느림. C는 Lambda 15분 timeout과 페이로드 한도 위반. D는 컨테이너 부팅 비용이 Lambda보다 훨씬 크고 운영 부담 큼. 함정: Distributed Map은 ItemReader로 S3 list, CSV, JSON Lines를 직접 source로 쓸 수 있어 사전 처리 불필요. ResultWriter로 자동 집계까지. 추가 학습: re:Invent 2022 발표.

---

**문제 5.** Step Functions Workflow의 한 단계에서 Lambda가 "Lambda.ServiceException"으로 일시적 실패. 지수 백오프로 3회 재시도하되, 그래도 실패하면 보상 단계로 진입. ASL은?

A) Retry만 사용
B) Catch만 사용
C) Retry + Catch 둘 다
D) Lambda 호출자가 재시도 처리

**정답: C**
해설: Retry는 같은 state 재실행(지수 백오프 + jitter), Catch는 다른 state로 분기. 두 레이어가 협업한다. Retry로 3회 재시도 → 그래도 실패하면 Catch가 보상 state로 라우팅. A는 보상 분기 없음. B는 재시도 없이 즉시 보상으로 가서 transient 오류에서도 비용 낭비. D는 코드로 재시도 처리하면 가시성·표준화 부족. 함정: Retry의 ErrorEquals에 `["Lambda.ServiceException", "Lambda.AWSLambdaException", "Lambda.SdkClientException", "States.TaskFailed"]`처럼 transient 오류만 지정. `States.ALL`은 보상 trigger에만. JitterStrategy=FULL(2023)으로 thundering herd 방지.

---

**문제 6.** Standard Workflow의 비용 모델은?

A) 호출 횟수만
B) 실행 시간(초)만
C) 상태 전이 횟수
D) 무료

**정답: C**
해설: Standard는 상태 전이당 $25/M 과금. 한 워크플로우가 4단계면 1회 실행당 4 전이. 실행 빈도 × 단계 수로 비용 계산. Express는 호출 + 시간(GB-second). A는 Express에 가까운 모델. B는 잘못된 단순화. D는 절대 무료가 아님. 함정: Standard는 장기 실행이라 단순 호출 횟수보다 단계 수가 비용 driver. "5단계 워크플로우를 월 100만 회"면 5M 전이 = $125 정도.

---

**문제 7.** ECS RunTask로 Fargate 컨테이너를 띄우고 완료를 기다린 후 다음 state로 진행. 적절한 통합 패턴은?

A) Request-Response
B) .sync
C) .waitForTaskToken
D) Polling Lambda

**정답: B**
해설: `arn:aws:states:::ecs:runTask.sync`는 ECS Task의 완료까지 Step Functions가 polling해주는 매니지드 패턴. 내부적으로 EventBridge가 ECS Task State Change 이벤트를 받아 Step Functions에 통지. IAM Role에 `iam:PassRole` + `events:PutTargets`/`events:PutRule` 권한 필요. A는 Task 시작만 하고 완료 안 기다림. C는 외부 콜백용. D는 비매니지드 polling으로 운영 부담. 함정: ".sync로 안 된다"는 시나리오의 99%는 IAM 권한 누락. 추가: EMR Step, Glue Job, SageMaker Training/Transform도 동일 패턴.

---

## 📌 오늘의 요약

1. **Step Functions = 분산 영속 상태 머신**, Saga 보상은 Catch + 별도 분기로
2. **Standard**(1년·전이당) vs **Express**(5분·호출+시간) — 빈도·시간으로 분기
3. **State 7종** + **Distributed Map**(10K 병렬 + S3 ItemReader)
4. **통합 3패턴**: Request-Response / **.sync**(Job 대기) / **.waitForTaskToken**(외부 콜백)
5. **Retry + Catch** — 지수 백오프 + jitter(2023), boundary는 transient vs 영구
6. **ASL path** 가공: InputPath → Parameters → ResultSelector → ResultPath → OutputPath
7. Workflow Studio로 시각적 작성 + IAM 자동 생성
