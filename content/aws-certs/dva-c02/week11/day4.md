# Day 54 - Step Functions와 AppSync: 흐름을 코드 밖으로 꺼내다

지금까지 본 SQS·SNS·Kinesis는 컴포넌트를 *떼어놓는* 도구였다. 그런데 현실의 비즈니스 프로세스는 떼어놓은 조각들을 다시 *순서대로 엮어야* 한다. "주문을 검증하고 → 재고를 확인하고 → 결제하고 → 실패하면 환불하고 → 성공하면 알림을 보낸다." 이걸 Lambda 안에 if-else와 try-catch로 짜 넣으면, 그 함수는 곧 비대해지고 상태는 코드 깊숙이 숨어버려 "지금 어느 단계에서 멈췄는지" 알 수 없게 된다. AWS Step Functions는 이 **흐름(workflow)을 코드 밖으로 꺼내** 명시적인 상태 기계로 만든다. 그리고 AppSync는 비슷한 정신을 데이터 계층에 적용해, 여러 백엔드에서 데이터를 모으는 "흐름"을 GraphQL 한 쿼리로 선언하게 한다.

DVA-C02에서 Step Functions는 "Lambda를 어떻게 오케스트레이션하나", "Standard와 Express의 차이", "외부 시스템 응답을 어떻게 기다리나"로 자주 나온다. AppSync는 "실시간 구독", "다중 데이터 소스", "API Gateway와의 차이"로 출제된다. 이번 글은 워크플로를 코드에서 분리하는 것이 왜 가치 있는지, 상태 기계라는 이론적 토대, 서비스 통합 패턴(`.sync`, `.waitForTaskToken`)이 푸는 문제, 그리고 GraphQL이 REST와 근본적으로 다른 지점을 깊이 들여다본다.

## 워크플로를 코드에서 꺼내는 이유: 오케스트레이션 대 코레오그래피

Lambda 함수 5개를 순서대로 실행해야 한다고 하자. 가장 단순한 방법은 함수 A가 끝나면 함수 B를 직접 호출(invoke)하고, B가 C를 호출하는 **체인**이다. 이걸 **코레오그래피(choreography)** 라 부른다 — 중앙 지휘자 없이 각자가 다음을 안다. 문제는 이 방식이 빠르게 무너진다는 것이다. C에서 에러가 나면 A, B를 어떻게 롤백하나? 지금 워크플로가 어느 단계인가? B를 재시도하려면? 이 로직이 각 함수에 흩어져 코드가 얽힌다.

**오케스트레이션(orchestration)** 은 정반대다. 중앙 지휘자(Step Functions)가 전체 흐름을 알고, 각 단계를 호출하며, 에러·재시도·분기·병렬을 모두 지휘자가 관리한다. 각 Lambda는 자기 일만 하고 "다음에 뭘 할지"를 모른다. 흐름의 로직이 코드가 아니라 **선언적 정의(Amazon States Language, JSON)** 로 한곳에 모여, 시각화되고, 실행 이력이 남는다.

```json
{
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:ValidateOrder",
      "Next": "CheckInventory",
      "Catch": [{"ErrorEquals": ["ValidationError"], "Next": "OrderFailed"}]
    },
    "CheckInventory": {
      "Type": "Choice",
      "Choices": [{"Variable": "$.inStock", "BooleanEquals": false, "Next": "Refund"}],
      "Default": "ProcessPayment"
    },
    "ProcessPayment": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:ProcessPayment",
      "Retry": [{"ErrorEquals": ["Lambda.ServiceException"],
                 "IntervalSeconds": 2, "MaxAttempts": 3, "BackoffRate": 2.0}],
      "Next": "OrderSuccess"
    },
    "OrderSuccess": {"Type": "Succeed"},
    "OrderFailed": {"Type": "Fail", "Error": "OrderError"},
    "Refund": {"Type": "Task", "Resource": "arn:aws:lambda:...:Refund", "Next": "OrderFailed"}
  }
}
```

> 💡 **관련 이론**: Step Functions가 구현하는 것은 컴퓨터 과학의 기본 개념인 **유한 상태 기계(Finite State Machine, FSM)** 다. 시스템이 유한한 상태들 중 하나에 있고, 입력에 따라 상태 간 전이가 일어나는 모델이다. FSM은 1950년대(Mealy, Moore 기계)부터 오토마타 이론의 토대였고, 정규 표현식 엔진·네트워크 프로토콜·UI 상태 관리가 모두 FSM이다. Step Functions는 이 추상화를 분산 워크플로에 적용해, 각 "상태(State)"가 작업·분기·병렬·대기를 표현하고 전이가 `Next`로 선언된다. 흐름을 FSM으로 모델링하면 "도달 불가능한 상태", "빠진 전이", "무한 루프" 같은 결함을 시각적으로 잡아낼 수 있다 — 코드에 묻혀 있을 때는 보이지 않던 것들이다.

> 🔍 **더 깊이**: 오케스트레이션 대 코레오그래피는 마이크로서비스 설계의 오래된 논쟁이다. 코레오그래피(이벤트 기반, 각자 반응)는 결합이 느슨하고 확장이 자연스럽지만, 전체 흐름이 어디에도 명시되지 않아 "지금 무슨 일이 일어나는지" 추적이 어렵다(emergent behavior). 오케스트레이션(중앙 지휘)은 흐름이 한곳에 명시되어 가시성·디버깅·에러 처리가 쉽지만, 지휘자가 결합점이 된다. 실무에서는 둘을 섞는다 — 서비스 *간* 큰 흐름은 이벤트(EventBridge/SNS)로 느슨하게, 한 비즈니스 트랜잭션 *안*의 단계들은 Step Functions로 명시적으로. "여러 단계 + 롤백 + 가시성"이 필요하면 오케스트레이션이 답이다.

## Standard 대 Express: 같은 추상화, 다른 실행 엔진

Step Functions에는 두 가지 워크플로 타입이 있고, 시험에서 매우 자주 갈린다. 둘은 같은 상태 언어를 쓰지만 실행 엔진과 보장이 다르다.

| 항목 | Standard | Express |
|------|----------|---------|
| 최대 실행 시간 | **1년** | **5분** |
| 실행 모델 | 정확히 1회(exactly-once) | At-least-once |
| 처리량 | 2,000 starts/s | **100,000 starts/s** |
| 실행 이력 | 콘솔 + CloudWatch(90일 조회) | CloudWatch Logs만 |
| 과금 | 상태 전환당 | 실행 시간 + 메모리 |
| 용도 | 긴/중요한 워크플로(인간 승인, 배포, 주문) | 짧고 빈번한 이벤트 처리(IoT, 스트림) |

핵심 직관: **Standard는 "오래 걸리고 한 번이 중요한" 흐름**(예: 인간 승인을 며칠 기다리는 배포 파이프라인, 정확히 한 번 결제해야 하는 주문)에, **Express는 "짧고 폭발적이고 멱등한" 흐름**(예: 초당 수만 건의 이벤트를 빠르게 변환)에 쓴다. Express가 at-least-once라는 건 중복 실행 가능성을 뜻하므로, 소비자가 멱등해야 한다(SQS 표준에서 본 것과 같은 원리).

> ⚠️ **함정**: "초당 수만 건의 짧은 이벤트 처리"에 Standard를 고르면 처리량(2,000/s)과 비용(상태 전환당 과금이 누적)에서 막힌다 — 답은 Express다. 반대로 "결제를 정확히 한 번, 인간 승인을 기다리며 며칠"이면 Express의 5분 한도와 at-least-once 때문에 부적합하고 Standard가 답이다. 실행 시간(1년 vs 5분)과 실행 보장(exactly-once vs at-least-once)이 두 결정 축이다.

## 서비스 통합 패턴: 기다림을 표현하는 세 가지 방법

Task 상태가 외부 서비스를 호출할 때, "언제 다음으로 넘어가나"가 패턴마다 다르다. 이 세 패턴은 시험에 자주 나온다.

| 패턴 | URI 형식 | 동작 |
|------|----------|------|
| Request-Response | `arn:aws:states:::lambda:invoke` | 호출하고 즉시 응답받아 다음으로 |
| Run a Job (`.sync`) | `arn:aws:states:::ecs:runTask.sync` | 작업이 **완료될 때까지 대기** |
| Wait for Callback (`.waitForTaskToken`) | `arn:aws:states:::sqs:sendMessage.waitForTaskToken` | **외부가 토큰으로 응답할 때까지 대기** |

**Request-Response**는 가장 단순하다 — 호출하고 응답이 오면 끝. **`.sync`** 는 "오래 걸리는 작업을 시작하고 그게 끝날 때까지 워크플로를 멈춰 기다린다"는 패턴이다. 예를 들어 ECS 태스크나 Glue 작업은 몇 분~몇 시간 걸리는데, `.sync`를 쓰면 Step Functions가 그 완료를 폴링해 기다렸다가 다음으로 넘어간다.

가장 흥미로운 건 **`.waitForTaskToken`** 이다. 이건 "기계가 아니라 사람이나 외부 시스템의 응답을 기다리는" 경우를 위한 것이다. Step Functions가 작업과 함께 **태스크 토큰**을 발급하고 워크플로를 일시정지한다. 외부(예: 승인자가 누른 버튼, 외부 결제사의 콜백)가 그 토큰과 함께 `SendTaskSuccess`/`SendTaskFailure`를 호출하면 비로소 워크플로가 재개된다. 며칠이 걸려도 상관없다(Standard의 1년 한도 안에서).

> 📚 **사례**: `.waitForTaskToken`의 전형적 사용처가 **인간 승인(human-in-the-loop)** 워크플로다. 환불 요청이 일정 금액을 넘으면, 워크플로가 관리자에게 승인 이메일/Slack을 보내고(토큰 포함) 멈춘다. 관리자가 승인 링크를 클릭하면 그 토큰으로 콜백이 와 워크플로가 재개되어 환불이 진행된다. 인간의 응답 시간(분~일)을 워크플로에 자연스럽게 통합하는 이 패턴은, 코드 기반 체인으로는 구현이 악몽이지만 Step Functions에서는 한 상태로 표현된다. 외부 결제 게이트웨이나 서드파티 API의 비동기 콜백을 기다리는 데도 같은 패턴을 쓴다.

> 🔍 **더 깊이**: 대용량 병렬 처리를 위한 **Map** 상태도 알아둘 가치가 있다. 일반 Map은 배열의 각 항목에 같은 하위 워크플로를 적용해 병렬 실행한다. 2022년 추가된 **Distributed Map**은 이를 극단으로 확장해 S3의 수만~수십만 개 객체나 거대한 JSON 배열을 대량 병렬(최대 1만 동시)로 처리한다 — "S3 버킷의 1억 개 파일을 처리"하는 시나리오의 답이다. 일반 Map은 부모 실행의 이력에 하위 실행이 포함되어 규모에 한계가 있지만, Distributed Map은 각 항목을 자식 실행으로 분리해 부모의 상태 크기 제한(256KB)을 우회한다. Parallel(고정된 다른 브랜치들을 동시에)과 Map(같은 로직을 배열에 반복)의 차이도 함께 기억하자.

## AppSync: 데이터 수집의 흐름을 GraphQL로 선언하다

Step Functions가 *작업의 흐름*을 선언적으로 만들었다면, AppSync는 *데이터 수집의 흐름*을 선언적으로 만든다. 모바일 화면 하나가 "사용자 정보 + 최근 주문 + 추천 상품"을 보여줘야 한다고 하자. REST라면 클라이언트가 세 엔드포인트를 각각 호출하고(over-fetching/under-fetching, 여러 왕복) 결과를 조합해야 한다. GraphQL은 클라이언트가 **필요한 데이터의 모양을 한 쿼리로 선언**하면, 서버가 여러 데이터 소스에서 모아 정확히 그 모양으로 돌려준다.

```graphql
type Query {
  getOrder(orderId: ID!): Order      # → DynamoDB 리졸버
}
type Mutation {
  updateOrderStatus(orderId: ID!, status: String!): Order  # → Lambda 리졸버
}
type Subscription {
  onOrderStatusUpdate(orderId: ID!): Order
    @aws_subscribe(mutations: ["updateOrderStatus"])       # 실시간 구독
}
```

AppSync의 핵심 개념은 **리졸버(resolver)** 다 — GraphQL 필드 하나를 특정 데이터 소스(DynamoDB, Lambda, RDS, HTTP, OpenSearch)에 매핑하는 함수다. `getOrder`는 DynamoDB를 직접 읽고, `updateOrderStatus`는 Lambda로 비즈니스 로직을 태우는 식으로, **한 GraphQL 스키마 안에서 필드마다 다른 백엔드**를 쓸 수 있다. 이게 "다중 데이터 소스를 한 쿼리로"라는 GraphQL의 강점을 AWS에서 구현한 것이다.

| 항목 | AppSync (GraphQL) | API Gateway (REST) |
|------|-------------------|--------------------|
| 데이터 페칭 | 한 쿼리로 필요한 만큼 정확히 | 엔드포인트별 고정 응답 |
| 다중 소스 | 한 쿼리에서 여러 백엔드 | 보통 단일 백엔드 |
| 실시간 | **내장 구독(WebSocket)** | WebSocket API 별도 구성 |
| 캐싱 | 응답 수준 | 메서드 수준 |
| 적합 | 모바일·복잡한 그래프 쿼리 | 일반 REST API |

> 💡 **관련 이론**: GraphQL(Facebook, 2015 공개)이 등장한 동기는 모바일의 제약이었다. 모바일은 네트워크 왕복이 비싸고 데이터 요금이 들어, REST의 "엔드포인트마다 고정된 큰 응답을 여러 번 호출"하는 방식이 비효율적이었다. **Over-fetching**(필요 없는 필드까지 받음)과 **under-fetching**(한 화면에 여러 호출 필요, N+1 왕복)을 동시에 푸는 게 GraphQL의 선언적 쿼리다. 다만 GraphQL도 만능이 아니다 — 서버 쪽에서 한 쿼리가 여러 리졸버를 호출하며 N+1 *데이터베이스* 문제를 일으킬 수 있어(DataLoader 같은 배칭이 필요), "클라이언트의 N+1을 서버의 N+1로 옮긴다"는 비판도 있다. REST가 죽은 게 아니라, "복잡한 그래프형 데이터를 모바일에 효율적으로"가 GraphQL의 자리다.

> 🔍 **더 깊이**: AppSync의 **실시간 구독(Subscription)** 은 `@aws_subscribe` 디렉티브로 특정 뮤테이션에 묶인다. `updateOrderStatus` 뮤테이션이 실행되면, 그 주문을 구독 중인 모든 클라이언트에게 AppSync가 WebSocket으로 변경을 푸시한다. 폴링 없이 서버가 변경을 밀어주는 이 모델은 채팅·실시간 대시보드·협업 앱의 기반이다. 클라이언트가 폴링하는 방식과 비교하면, 폴링은 "변화가 없어도 계속 묻는" 낭비와 "변화 후 다음 폴링까지의 지연"이 있는데, 구독은 변화 시점에 정확히 한 번 푸시되어 둘 다 없앤다 — Day 1에서 본 SQS 롱 폴링이 풀려던 문제를 아예 푸시로 뒤집은 셈이다. 인증은 API_KEY/IAM/Cognito User Pool/OIDC/Lambda Authorizer를 지원한다.

## 정리하며

이번 글을 관통하는 한 문장은 "흐름을 코드에서 꺼내 선언적으로 만든다"이다. Step Functions는 작업의 흐름을 유한 상태 기계로 명시해 가시성·재시도·에러 처리·인간 승인을 코드 밖으로 꺼냈고, Standard와 Express는 "오래·정확히 1회"와 "짧고·빈번·멱등"으로 갈린다. `.sync`는 작업 완료를, `.waitForTaskToken`은 외부/인간의 응답을 워크플로 안에서 기다리게 하며, Distributed Map은 대량 병렬을 푼다. AppSync는 같은 정신을 데이터 계층에 적용해, 다중 백엔드에서 데이터를 모으는 흐름을 GraphQL 한 쿼리로 선언하고 실시간 구독으로 변경을 푸시한다. 오케스트레이션도 GraphQL도 결국 "흩어진 조각을 다시 엮되, 엮는 로직을 코드가 아닌 선언으로 한곳에 모은다"는 같은 사상의 두 적용이다.

다음 글에서는 Week 11에서 다룬 SQS·SNS·Kinesis·Step Functions·AppSync 전체를 시나리오 중심으로 종합 복습한다.

---

## 📝 연습 문제

**문제 1.** 5개의 Lambda를 순서대로 실행하되, 중간 단계 실패 시 이전 작업을 보상(롤백)하고 전체 흐름을 시각적으로 추적해야 한다. 가장 적절한 방법은?

A) 각 Lambda가 다음 Lambda를 직접 invoke하는 체인

B) Step Functions로 오케스트레이션(Retry/Catch + 보상 단계)

C) SQS로 단계를 연결

D) EventBridge 규칙 체인

**정답: B**

해설: "여러 단계 + 보상(롤백) + 가시성"이 필요하면 **오케스트레이션**(Step Functions)이 답이다. 흐름이 상태 언어로 한곳에 명시되어 시각화·추적되고, Catch로 실패를 잡아 보상 단계(Saga 패턴)로 분기하며, Retry로 자동 재시도한다. A) 직접 체인(코레오그래피)은 흐름이 코드에 흩어져 롤백·추적이 어렵다. C·D는 순서·분기·보상을 명시적으로 관리하기에 부적합하며 가시성이 떨어진다.

---

**문제 2.** 초당 약 5만 건의 짧은 IoT 이벤트를 변환하는 워크플로가 필요하다. 각 실행은 수 초 내 끝나고 중복 실행은 멱등 처리로 허용된다. 적절한 Step Functions 타입은?

A) Standard

B) Express

C) 둘 다 불가능

D) Standard를 여러 개

**정답: B**

해설: **Express**는 100,000 starts/s의 높은 처리량과 실행 시간 기반 저비용 과금으로 "짧고 빈번한" 워크플로에 맞는다. at-least-once(중복 가능)지만 멱등 처리가 허용되므로 문제없다. A) Standard는 2,000 starts/s 한도와 상태 전환당 과금으로 5만 건/s에서 처리량·비용 모두 막힌다. 실행 시간(짧음)과 처리량(높음), 멱등 허용이 모두 Express를 가리킨다.

---

**문제 3.** 환불 워크플로에서 일정 금액 초과 시 관리자 승인을 받아야 하며, 승인까지 며칠이 걸릴 수 있다. 승인 후 워크플로를 재개하려면?

A) Wait 상태로 고정 시간 대기

B) `.waitForTaskToken` 통합으로 토큰을 발급해 멈추고, 관리자 승인 콜백이 토큰과 함께 오면 재개

C) `.sync`로 완료 대기

D) Express 워크플로 사용

**정답: B**

해설: **`.waitForTaskToken`** 은 외부/인간의 응답을 기다리는 패턴이다. Step Functions가 태스크 토큰을 발급하고 워크플로를 일시정지하며, 관리자가 승인 링크를 눌러 `SendTaskSuccess`를 토큰과 함께 호출하면 재개된다. 며칠이 걸려도 Standard의 1년 한도 안에서 가능하다. A) Wait는 고정 시간이라 "언제 승인될지 모름"에 부적합하다. C) `.sync`는 기계 작업 완료 대기용이다. D) Express는 5분 한도라 며칠 대기가 불가능하다.

---

**문제 4.** S3 버킷의 수십만 개 객체를 각각 변환하는 대량 병렬 처리가 필요하다. 적절한 Step Functions 상태는?

A) Parallel

B) Distributed Map

C) Choice

D) Wait

**정답: B**

해설: **Distributed Map**(2022)은 S3 객체나 거대한 JSON 배열을 최대 1만 동시까지 대량 병렬 처리하며, 각 항목을 자식 실행으로 분리해 부모 상태 크기 제한(256KB)을 우회한다. "S3의 수십만/1억 개 파일 처리"의 정석이다. A) Parallel은 고정된 서로 다른 브랜치들을 동시 실행하는 것이지 배열 반복이 아니다. 일반 Map은 부모 이력에 포함되어 대규모에 한계가 있다. C·D는 병렬 처리와 무관하다.

---

**문제 5.** 모바일 앱이 한 화면에 사용자 정보(DynamoDB), 주문 내역(Lambda 경유), 추천(OpenSearch)을 한 번에 효율적으로 가져오고, 주문 상태 변경을 실시간으로 받아야 한다. 적절한 서비스는?

A) API Gateway REST API

B) AWS AppSync (GraphQL, 다중 리졸버 + 실시간 구독)

C) 세 개의 별도 REST 엔드포인트

D) Kinesis

**정답: B**

해설: **AppSync**는 한 GraphQL 쿼리에서 필드별로 다른 데이터 소스(DynamoDB·Lambda·OpenSearch)를 리졸버로 매핑해 한 번에 모으고(under-fetching·다중 왕복 해결), `@aws_subscribe`로 WebSocket 실시간 구독을 내장 제공한다. A·C) REST는 엔드포인트마다 고정 응답이라 여러 왕복이 필요하고 실시간 구독이 기본 제공되지 않는다. D) Kinesis는 스트리밍 데이터용이지 클라이언트 데이터 API가 아니다.

---

**문제 6.** Step Functions Standard와 Express의 차이로 옳은 것은?

A) Standard는 5분, Express는 1년 실행 가능

B) Standard는 최대 1년·exactly-once, Express는 최대 5분·at-least-once·고처리량

C) 둘 다 exactly-once를 보장한다

D) Express가 더 긴 워크플로에 적합하다

**정답: B**

해설: **Standard**는 최대 1년 실행, exactly-once, 상태 전환당 과금으로 길고 중요한 워크플로(인간 승인, 결제)에 맞는다. **Express**는 최대 5분, at-least-once(중복 가능), 실행 시간 과금, 최대 100,000 starts/s로 짧고 빈번한 멱등 처리에 맞는다. A는 둘을 뒤바꿨고, C는 Express가 at-least-once라 틀렸으며, D는 Standard가 긴 워크플로용이라 반대다.

---

**문제 7.** GraphQL이 모바일 환경에서 REST보다 효율적인 핵심 이유는?

A) GraphQL이 항상 더 빠르다

B) 클라이언트가 필요한 데이터 모양을 한 쿼리로 선언해 over-fetching과 under-fetching(다중 왕복)을 동시에 줄인다

C) GraphQL은 캐싱이 필요 없다

D) REST는 모바일에서 동작하지 않는다

**정답: B**

해설: REST는 엔드포인트마다 고정된 응답을 주므로, 불필요한 필드까지 받는 **over-fetching**과 한 화면에 여러 호출이 필요한 **under-fetching(N+1 왕복)** 이 생긴다. 모바일은 왕복과 데이터 요금이 비싸 이게 문제였고, GraphQL은 클라이언트가 필요한 데이터 모양을 한 쿼리로 선언해 둘을 동시에 줄인다. A) 항상 빠른 건 아니며 서버 측 N+1을 유발할 수 있다. C) 캐싱은 여전히 유용하다(AppSync도 제공). D) REST도 모바일에서 잘 동작한다.
