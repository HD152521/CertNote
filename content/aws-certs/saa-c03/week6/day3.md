# Day 3 - Step Functions와 AppSync: 오케스트레이션과 GraphQL

Lambda 함수 하나가 하나의 작업을 처리하는 것은 단순하다. 그런데 주문 처리처럼 검증 → 재고 확인 → 결제 → 배송 요청 → 알림이라는 여러 단계가 순서와 조건을 가지고 연결될 때, Lambda 안에서 이 흐름을 직접 코딩하면 어떻게 될까. 각 Lambda가 다음 Lambda를 호출하고, 실패 시 이전 단계를 취소하고, 어디까지 완료됐는지 추적하는 코드가 Lambda 비즈니스 로직과 뒤엉킨다. Step Functions는 이 흐름 제어(Flow Control)를 코드 밖으로 꺼내서 시각적 상태 머신으로 정의한다.

이런 오케스트레이션 문제는 마이크로서비스 아키텍처에서 특히 심각하다. 서비스가 늘어날수록 서비스 간 조율 로직이 각 서비스에 분산되어 버린다. 한 서비스가 다음 서비스를 직접 호출하는 코레오그래피(Choreography) 방식은 이벤트 기반으로 느슨하게 결합되지만, 전체 흐름을 한눈에 파악하기 어렵다. Step Functions의 오케스트레이션(Orchestration) 방식은 중앙에서 흐름을 정의하고 시각화할 수 있어서 복잡한 비즈니스 프로세스 추적에 유리하다.

## Step Functions — 상태 머신으로 워크플로를 표현하다

Step Functions는 Amazon States Language(ASL)라는 JSON 기반 언어로 워크플로를 정의한다. ASL에서 모든 것은 "상태(State)"이고, 상태 간에 전이(Transition)가 있다. 실행 중인 워크플로의 각 단계가 어디에 있는지, 어떤 데이터를 가지고 있는지, 무엇이 실패했는지를 Step Functions 서비스가 추적하고 영속화한다. Lambda는 이 상태 머신에서 호출되는 "작업자"일 뿐이다.

### Standard vs Express — 두 가지 모드

| 항목 | Standard | Express |
|------|----------|---------|
| 최대 실행 시간 | 1년 | 5분 |
| 실행 의미론 | Exactly-once | Async: At-least-once / Sync: At-most-once |
| 실행 이력 | AWS 콘솔에서 상세 추적 가능 | CloudWatch Logs로 별도 저장 필요 |
| 비용 | 상태 전환당 과금 | 실행 수 + 실행 시간 과금 |
| 처리량 | 초당 2,000 실행 | 초당 100,000 이상 실행 |
| 적합한 워크로드 | 장기 비즈니스 프로세스, 인간 승인 | 대량 짧은 워크플로 (IoT, 스트리밍, ETL) |

Standard는 각 상태 전환이 "exactly-once" 의미론을 보장한다. 결제 처리나 이메일 발송처럼 중복 실행이 치명적인 작업에 적합하다. Express는 초당 100,000개 이상의 실행을 처리할 수 있는 높은 처리량이 필요한 경우에 쓴다. 짧은 IoT 이벤트 처리, 스트리밍 데이터 변환에 적합하다.

> 💡 **Exactly-once의 분산 시스템 이론** — "Exactly-once"는 분산 시스템에서 가장 어려운 보장 중 하나다. 네트워크 실패가 발생했을 때 재시도를 하면 at-least-once가 되고(중복 가능), 재시도를 안 하면 at-most-once가 된다(손실 가능). Step Functions Standard는 내부적으로 분산 로그와 멱등성(Idempotency) 메커니즘을 통해 exactly-once를 구현한다. 이 구현은 Leslie Lamport의 Paxos(1989)와 유사한 합의 알고리즘을 기반으로 한다. 이 보장이 성능 비용으로 이어지는 것이 Standard가 Express보다 비싸고 처리량이 낮은 이유다. Express의 at-least-once는 중복 처리가 가능한 멱등적 작업(Idempotent Operation)에서만 안전하다.

### 핵심 상태 타입

**Task 상태**: Lambda 호출, ECS 태스크 시작, DynamoDB 쓰기, SQS 메시지 전송, SageMaker 훈련 등 실제 작업을 수행한다. SDK Integration으로 200개 이상의 AWS 서비스를 직접 호출 가능해서 Lambda 없이도 AWS 서비스를 조합할 수 있다.

**Choice 상태**: 조건 분기. 특정 값에 따라 다른 상태로 전이한다. `if-else`의 선언적 표현.

**Parallel 상태**: 여러 브랜치를 동시에 실행하고 모두 완료될 때까지 기다린다. 신용 조회와 신원 확인을 동시에 하고 둘 다 완료 후 다음 단계로.

**Map 상태**: 배열의 각 항목에 대해 동일한 처리를 반복한다. Distributed Map은 최대 10,000개의 병렬 실행을 지원하고, S3 객체 배열을 처리하는 데 최적화되어 있다.

**Wait 상태**: 지정된 시간 또는 특정 타임스탬프까지 대기. 결제 처리 3초 후 결제 상태 확인, 예약 24시간 후 리마인더 발송 등.

**waitForTaskToken**: 장기 대기 패턴. Task 상태에서 태스크 토큰을 외부 시스템(사람, 외부 API, 레거시 시스템)에 전달하고, 그 시스템이 토큰을 포함해서 콜백을 보낼 때까지 Step Functions가 대기한다. 대기 중에는 비용이 발생하지 않고 최대 1년까지 대기 가능.

```json
// waitForTaskToken 예시 (인간 승인 — 결제 처리)
{
  "Type": "Task",
  "Resource": "arn:aws:states:::sqs:sendMessage.waitForTaskToken",
  "Parameters": {
    "QueueUrl": "https://sqs.../approval-queue",
    "MessageBody": {
      "orderId.$": "$.orderId",
      "amount.$": "$.amount",
      "taskToken.$": "$$.Task.Token",
      "approvalUrl.$": "States.Format('https://app.example.com/approve?token={}', $$.Task.Token)"
    }
  },
  "HeartbeatSeconds": 86400,
  "Next": "ApprovedState",
  "Catch": [
    {
      "ErrorEquals": ["States.HeartbeatTimeout"],
      "Next": "ApprovalExpiredState"
    }
  ]
}
```

승인자가 SQS 메시지를 받아 확인 후 `SendTaskSuccess(taskToken)` 또는 `SendTaskFailure(taskToken)`를 호출하면 워크플로가 재개된다.

> 📚 **Intuit TurboTax Step Functions 사례** — 2021년 Intuit(TurboTax, QuickBooks)는 세금 신고 처리 워크플로를 Step Functions Standard로 구현한 사례를 AWS re:Invent에서 발표했다. 세금 신고 프로세스는 데이터 검증 → 계산 → 정부 기관 제출 → 확인 대기(최대 수 시간) → 결과 통보의 단계를 가진다. 특히 정부 기관 확인 대기 단계에서 waitForTaskToken을 사용해서 실제로 정부 응답이 올 때까지 무상태로 대기했다. 이 패턴으로 월 수백만 건의 세금 신고를 처리한다. 과거에는 Lambda 안에서 폴링 루프로 구현했지만, Step Functions + waitForTaskToken으로 전환하면서 비용이 90% 절감됐다고 발표했다.

### 에러 처리 — Retry와 Catch

Step Functions에서 모든 Task 상태는 `Retry`와 `Catch`를 가질 수 있다.

**Retry**: 특정 오류 유형에 대해 재시도 횟수, 초기 지연, 백오프 배율을 설정한다.

```json
"Retry": [
  {
    "ErrorEquals": ["Lambda.ServiceException", "Lambda.TooManyRequestsException"],
    "IntervalSeconds": 2,
    "MaxAttempts": 3,
    "BackoffRate": 2,
    "MaxDelaySeconds": 30
  }
]
```

2초 → 4초 → 8초 간격으로 최대 3회 재시도(지수 백오프). 모두 실패하면 Catch로 넘어간다.

**Catch**: 특정 오류를 잡아서 다른 상태로 라우팅한다. 사가(Saga) 패턴의 보상 트랜잭션을 여기서 구현한다.

```json
"Catch": [
  {
    "ErrorEquals": ["PaymentFailedException"],
    "ResultPath": "$.error",
    "Next": "ReleaseInventoryState"
  },
  {
    "ErrorEquals": ["States.ALL"],
    "ResultPath": "$.unexpectedError",
    "Next": "HandleUnexpectedError"
  }
]
```

결제 실패 시 재고를 다시 릴리즈하는 보상 트랜잭션으로 연결. `States.ALL`은 모든 오류를 잡는 와일드카드.

> 🔍 **Saga 패턴의 학문적 기원과 Step Functions 구현** — Step Functions의 사가 패턴은 Hector Garcia-Molina와 Kenneth Salem의 1987년 논문 "Sagas"(ACM SIGMOD)에서 제안된 분산 트랜잭션 패턴을 구현한다. 마이크로서비스 환경에서 여러 서비스에 걸친 트랜잭션을 2PC(2-Phase Commit)로 원자적으로 처리하면 성능 저하와 가용성 문제가 발생한다. Saga 패턴은 각 단계의 "보상 트랜잭션(Compensating Transaction)"을 정의해서 실패 시 이전 단계를 되돌린다. Step Functions의 Catch + 보상 Lambda 함수 호출이 이 패턴의 클라우드 구현이다. 완전한 ACID 트랜잭션이 아니라 "Eventually Consistent" 상태를 보상 트랜잭션으로 달성하는 것이 핵심이다.

> ⚠️ **256KB 데이터 한도** — Step Functions 상태 간에 전달되는 입출력 데이터는 256KB 한도가 있다. Lambda 실행 결과가 큰 경우(수 MB의 데이터) Lambda에서 S3에 결과를 저장하고 Step Functions에는 S3 URI만 전달하는 패턴을 써야 한다. 256KB를 초과하면 실행이 실패한다. 대용량 데이터 처리 시 반드시 S3를 중간 스토리지로 활용해야 한다.

### Distributed Map — 대규모 병렬 처리

Distributed Map은 S3의 수백만 개 객체를 병렬로 처리하거나, 대규모 배열의 각 항목을 동시에 처리할 때 사용한다. 최대 10,000개의 동시 실행을 지원한다.

실제 사용 예: S3 버킷에 있는 1만 개의 CSV 파일을 각각 Lambda로 처리해서 집계. Distributed Map이 없다면 Lambda를 순차적으로 호출하거나 복잡한 병렬 처리 로직을 직접 구현해야 한다.

```json
{
  "Type": "Map",
  "ItemReader": {
    "Resource": "arn:aws:states:::s3:listObjectsV2",
    "Parameters": {
      "Bucket": "my-data-bucket",
      "Prefix": "raw-data/"
    }
  },
  "MaxConcurrency": 1000,
  "ToleratedFailurePercentage": 10,
  "Iterator": {
    "StartAt": "ProcessFile",
    "States": {
      "ProcessFile": {
        "Type": "Task",
        "Resource": "arn:aws:lambda:...:function:process-csv",
        "Retry": [{"ErrorEquals": ["States.ALL"], "MaxAttempts": 2}],
        "End": true
      }
    }
  },
  "ResultWriter": {
    "Resource": "arn:aws:states:::s3:putObject",
    "Parameters": {
      "Bucket": "results-bucket",
      "Prefix": "results/"
    }
  }
}
```

`ToleratedFailurePercentage`: 일부 실패를 허용하고 전체 Map을 성공으로 간주. 100% 완벽보다 80% 성공도 허용되는 데이터 처리에 유용.

## AppSync — 관리형 GraphQL 서비스

GraphQL은 Facebook이 2012년 내부에서 개발하고 2015년 오픈 소스로 공개한 API 쿼리 언어다. REST API의 Over-fetching(필요 이상의 데이터 반환)과 Under-fetching(여러 번 요청 필요) 문제를 해결하기 위해 설계됐다.

GraphQL의 핵심 차이: 클라이언트가 필요한 필드를 명시한다.

```graphql
# REST API 방식: 여러 엔드포인트 호출 필요
# GET /users/123  → { id, name, email, age, address, ... }  # Over-fetching
# GET /users/123/orders  → 별도 호출  # Under-fetching (N+1 문제)

# GraphQL 방식: 한 번에, 필요한 것만
query {
  user(id: "123") {
    name                         # name만 요청 (Over-fetching 없음)
    recentOrders(limit: 5) {     # 한 쿼리에서 관계 데이터도 함께 (Under-fetching 없음)
      orderId
      totalAmount
      status
    }
  }
}
```

AppSync는 이 GraphQL을 관리형으로 제공한다. 스키마 정의 → Resolver 구성 → 백엔드 연결이 선언적으로 이루어진다.

### 데이터 소스와 Resolver

AppSync는 다양한 데이터 소스를 Resolver를 통해 연결한다.

- **DynamoDB**: GetItem, Query, PutItem 등 직접 호출 (Lambda 없이)
- **Aurora Serverless**: RDS Data API를 통한 SQL 실행
- **Lambda**: 복잡한 비즈니스 로직, 여러 소스 조합
- **OpenSearch**: 전문 검색
- **HTTP**: 외부 REST API 호출
- **EventBridge**: 이벤트 발행

**Pipeline Resolver**: 하나의 GraphQL 필드 해석에 여러 함수를 체인으로 연결. "사용자 조회 → 권한 확인 → 데이터 반환"같은 복합 로직을 코드 없이 구성.

```
Pipeline Resolver 실행 순서:
Before Mapping Template
→ Function 1 (예: 권한 확인)
→ Function 2 (예: 데이터 조회)
→ Function 3 (예: 결과 변환)
→ After Mapping Template
→ 클라이언트에 반환
```

### 실시간 구독(Subscription)

AppSync의 강력한 기능 중 하나는 GraphQL Subscription이다. 특정 Mutation이 발생했을 때 구독자에게 자동으로 Push한다.

```graphql
# Mutation: 새 메시지 보내기
mutation SendMessage {
  sendMessage(roomId: "room1", text: "안녕하세요") {
    messageId
    text
    timestamp
  }
}

# Subscription: 새 메시지 수신 (다른 클라이언트가 등록)
subscription OnNewMessage {
  onCreateMessage(roomId: "room1") {
    messageId
    text
    sender { name }
    timestamp
  }
}
```

클라이언트가 Subscription을 시작하면 WebSocket 연결이 열리고, 누군가 `sendMessage` Mutation을 실행할 때마다 구독자에게 자동으로 Push된다. 채팅, 협업 도구, 실시간 피드에 완벽한 패턴이다.

> 💡 **GraphQL N+1 문제와 DataLoader 해결** — GraphQL의 N+1 문제는 관계형 데이터를 처리할 때 발생한다. 예를 들어 100명의 사용자 목록을 가져오고(`1번 쿼리`), 각 사용자의 최근 주문을 가져오면 100번의 추가 쿼리가 발생한다(`N번 쿼리`, 총 1+N번). Facebook은 이를 해결하기 위해 Dataloader라는 배치 로딩 라이브러리를 개발했다. 개별 요청을 모아서 배치로 처리한다 — 100명의 userId를 모아서 `BatchGetItem`으로 한번에 조회. AppSync도 DynamoDB BatchGetItem 통합과 Pipeline Resolver로 이 문제를 완화한다. Lambda Resolver를 사용할 때는 직접 Dataloader를 구현하거나, AppSync의 배치 처리 기능을 활용한다.

> 🔍 **AppSync Caching** — AppSync는 per-resolver 캐싱을 지원한다. 특정 쿼리의 응답을 TTL 동안 캐싱하면 DynamoDB/Lambda 호출을 줄일 수 있다. 캐시 크기는 t2.micro부터 r4.8xlarge까지 선택 가능하다. REST API의 전체 응답 캐싱과 달리, AppSync는 필드 단위로 캐시를 제어할 수 있어서 자주 변경되는 필드와 그렇지 않은 필드를 다르게 캐싱할 수 있다. Subscription 데이터는 캐싱되지 않는다(항상 실시간).

### AppSync vs API Gateway — 선택 기준

| 기준 | AppSync | API Gateway |
|------|---------|------------|
| 쿼리 언어 | GraphQL | REST/HTTP |
| 필드 선택 | 클라이언트가 결정 | 서버가 결정 |
| 다중 데이터 소스 | 한 쿼리에서 여러 소스 | 엔드포인트당 하나 |
| 실시간 Push | Subscription (WebSocket) | WebSocket API (직접 구현) |
| N+1 문제 해결 | DataLoader + Pipeline Resolver | 없음 |
| 캐싱 | per-resolver 캐싱 | 전체 응답 캐싱 (REST만) |
| 타입 시스템 | GraphQL Schema (강타입) | OpenAPI/Swagger |
| 주요 사용 사례 | 모바일/웹 앱, 다양한 클라이언트 | 마이크로서비스 REST API |

AppSync가 적합한 시나리오:
- 모바일 앱과 웹 앱이 같은 API를 공유하지만 필요한 데이터가 다를 때
- 하나의 화면에서 여러 마이크로서비스의 데이터를 합쳐서 보여줄 때
- 실시간 업데이트가 필요한 협업 도구, 채팅, 소셜 피드
- 오프라인 동기화가 필요한 모바일 앱 (Amplify DataStore)

API Gateway가 적합한 시나리오:
- 단순한 RESTful CRUD API
- 파트너 API (API Key + Usage Plan 필요)
- 기존 REST 클라이언트와의 호환이 필요한 경우
- WebSocket 직접 구현이 필요한 경우 (AppSync 보다 세밀한 제어)

다른 클라우드와의 비교:

| 항목 | AWS AppSync | GCP Firebase/GraphQL | Azure API Management |
|------|------------|---------------------|---------------------|
| 관리형 GraphQL | O (AppSync) | X (직접 구현) | X (직접 구현) |
| 실시간 구독 | O (WebSocket) | O (Realtime DB, Firestore) | X |
| 오프라인 동기화 | O (Amplify DataStore) | O (Firestore 오프라인) | X |
| 백엔드 통합 | DDB/Lambda/RDS/OpenSearch/HTTP | Firestore/Cloud Functions | 자체 API |

## CLI로 Step Functions와 AppSync 설정

```bash
# Step Functions Standard 상태 머신 생성 (주문 처리 워크플로)
aws stepfunctions create-state-machine \
  --name OrderProcessingFlow \
  --role-arn arn:aws:iam::111:role/stepfunctions-role \
  --type STANDARD \
  --definition '{
    "Comment": "주문 처리 워크플로",
    "StartAt": "ValidateOrder",
    "States": {
      "ValidateOrder": {
        "Type": "Task",
        "Resource": "arn:aws:lambda:ap-northeast-2:111:function:validate-order",
        "Retry": [
          {
            "ErrorEquals": ["Lambda.ServiceException"],
            "MaxAttempts": 3,
            "BackoffRate": 2
          }
        ],
        "Catch": [{"ErrorEquals": ["ValidationError"], "Next": "OrderFailed"}],
        "Next": "CheckInventory"
      },
      "CheckInventory": {
        "Type": "Task",
        "Resource": "arn:aws:states:::dynamodb:getItem",
        "Parameters": {
          "TableName": "Inventory",
          "Key": {"productId": {"S.$": "$.productId"}}
        },
        "Next": "ProcessPayment"
      },
      "ProcessPayment": {
        "Type": "Task",
        "Resource": "arn:aws:states:::sqs:sendMessage.waitForTaskToken",
        "Parameters": {
          "QueueUrl": "https://sqs.ap-northeast-2.amazonaws.com/111/payment-queue",
          "MessageBody": {
            "orderId.$": "$.orderId",
            "amount.$": "$.amount",
            "taskToken.$": "$$.Task.Token"
          }
        },
        "HeartbeatSeconds": 300,
        "Catch": [{"ErrorEquals": ["PaymentFailedException"], "Next": "ReleaseInventory"}],
        "Next": "NotifyCustomer"
      },
      "ReleaseInventory": {
        "Type": "Task",
        "Resource": "arn:aws:lambda:ap-northeast-2:111:function:release-inventory",
        "Next": "OrderFailed"
      },
      "NotifyCustomer": {
        "Type": "Task",
        "Resource": "arn:aws:states:::sns:publish",
        "Parameters": {
          "TopicArn": "arn:aws:sns:ap-northeast-2:111:order-notifications",
          "Message.$": "States.Format('"'"'주문 {} 처리 완료'"'"', $.orderId)"
        },
        "End": true
      },
      "OrderFailed": {
        "Type": "Fail",
        "Error": "OrderProcessingFailed"
      }
    }
  }'

# Express 상태 머신 생성 (IoT 이벤트 처리 — 고처리량)
aws stepfunctions create-state-machine \
  --name IoTEventProcessor \
  --role-arn arn:aws:iam::111:role/sfn-role \
  --type EXPRESS \
  --logging-configuration '{
    "level": "ALL",
    "includeExecutionData": true,
    "destinations": [{"cloudWatchLogsLogGroup": {"logGroupArn": "arn:aws:logs:ap-northeast-2:111:log-group:sfn-iot"}}]
  }' \
  --definition file://iot-flow.json

# 상태 머신 실행
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:ap-northeast-2:111:stateMachine:OrderProcessingFlow \
  --input '{"orderId": "ord-001", "productId": "prod-001", "amount": 29900}'

# 실행 이력 조회
aws stepfunctions get-execution-history \
  --execution-arn arn:aws:states:ap-northeast-2:111:execution:OrderProcessingFlow:exec-uuid

# AppSync API 생성 (Cognito + API Key 인증)
aws appsync create-graphql-api \
  --name prod-graphql-api \
  --authentication-type AMAZON_COGNITO_USER_POOLS \
  --user-pool-config userPoolId=ap-northeast-2_xxx,awsRegion=ap-northeast-2,defaultAction=ALLOW \
  --additional-authentication-providers '[{"authenticationType": "API_KEY"}]'

# AppSync DynamoDB 데이터 소스 연결
aws appsync create-data-source \
  --api-id api-id \
  --name OrdersTable \
  --type AMAZON_DYNAMODB \
  --service-role-arn arn:aws:iam::111:role/appsync-ddb-role \
  --dynamodb-config tableName=Orders,awsRegion=ap-northeast-2

# AppSync 캐싱 활성화 (per-resolver TTL)
aws appsync update-graphql-api \
  --api-id api-id \
  --caching-config ttl=300,cachingKeys="\$context.arguments.id"

# AppSync API Key 생성 (개발/테스트용)
aws appsync create-api-key \
  --api-id api-id \
  --expires 1800000000
```

## 정리하며

Step Functions는 Lambda 함수들을 코드가 아닌 상태 머신 정의로 오케스트레이션하는 서비스다. Standard는 1년까지 exactly-once, Express는 5분 안에 대량 처리. waitForTaskToken으로 인간 승인이나 외부 콜백을 기다리고, Distributed Map으로 1만 개 병렬 처리를 선언적으로 구성한다. Retry + Catch는 Saga 패턴으로 보상 트랜잭션을 구현한다.

AppSync는 GraphQL API를 관리형으로 제공하고, Subscription으로 실시간 Push를 쉽게 구현한다. 다양한 클라이언트(모바일/웹)가 각자 필요한 데이터만 가져가야 하는 시나리오, Over-fetching/Under-fetching 문제, 실시간 협업이 AppSync의 자연스러운 사용 사례다.

내일은 컨테이너의 세계로 간다. ECS, EKS, Fargate, ECR이 어떻게 다르고, 컨테이너에서 IAM 권한을 올바르게 관리하는 방법을 다룬다.

---

## 📝 연습 문제

**문제 1.** 대출 심사 워크플로를 구현한다. 신청서 접수 → 신용 조회(자동) → 심사위원 검토(인간, 최대 3일) → 승인/거절 알림. 이 워크플로에 가장 적합한 Step Functions 구성은?

A) Express Workflow (빠른 처리)
B) Standard Workflow + waitForTaskToken (최대 1년 대기 가능, 심사위원 콜백)
C) Standard Workflow + Wait 상태 (3일 타이머 대기)
D) Express Workflow + Lambda 폴링 (심사 결과 주기적 확인)

**정답: B**

해설: 인간이 개입하는 승인 단계에서 최대 3일을 기다려야 한다. Standard Workflow는 최대 1년 실행이 가능하고, waitForTaskToken은 외부에서 콜백이 올 때까지 비용 없이 대기한다. 심사위원에게 태스크 토큰이 전달되고, 심사위원이 승인/거절 버튼을 누르면 해당 토큰으로 SendTaskSuccess/SendTaskFailure를 호출해서 워크플로가 재개된다. A는 5분 한도로 3일 대기 불가. C의 Wait 상태는 고정 시간 대기이지 콜백 대기가 아니다. D는 Express의 5분 한도와 복잡한 폴링 구현이 부적합하다.

---

**문제 2.** S3 버킷에 매일 100만 개의 JSON 파일이 업로드된다. 각 파일을 Lambda로 처리해서 DynamoDB에 집계 데이터를 저장해야 한다. 가장 효율적인 방법은?

A) Lambda를 트리거해서 S3 파일 목록을 조회하고 순차적으로 처리한다
B) Step Functions Standard Workflow + Distributed Map (최대 10,000 병렬)
C) SQS에 파일 경로를 넣고 Lambda가 폴링해서 처리한다
D) EventBridge + Step Functions Express로 파일별 워크플로 실행

**정답: B**

해설: Distributed Map은 S3 객체 목록을 직접 읽어서 각 객체를 병렬로 처리하는 데 최적화되어 있다. MaxConcurrency를 10,000으로 설정하면 100만 개를 100번의 배치로 처리할 수 있다. 결과는 S3에 자동 저장. A는 순차 처리라서 100만 개를 처리하는 시간이 너무 길다. C는 SQS가 좋은 방법이지만 S3 목록 조회와 큐 관리 로직이 별도로 필요하고 Distributed Map처럼 깔끔하지 않다. D는 EventBridge로 파일 하나하나에 대해 워크플로를 트리거하는 것은 과도한 오버헤드다.

---

**문제 3.** 모바일 앱과 웹 앱이 같은 백엔드를 사용하는데, 모바일은 화면이 작아서 사용자 이름과 프로필 사진만 필요하고, 웹은 전체 프로필 + 최근 주문 10개 + 친구 목록이 필요하다. 같은 API로 두 클라이언트의 요구를 효율적으로 처리하려면?

A) REST API를 두 개 만든다 (모바일용, 웹용)
B) REST API 하나에서 클라이언트 타입 헤더로 응답을 분기한다
C) AppSync GraphQL API (클라이언트가 필요한 필드를 쿼리에 명시)
D) Lambda에서 User-Agent로 클라이언트를 감지하고 다른 응답을 반환한다

**정답: C**

해설: GraphQL의 핵심 장점이 바로 클라이언트가 필요한 필드를 명시할 수 있다는 것이다. 모바일은 `{ user { name, profilePicture } }`를 요청하고, 웹은 `{ user { name, profilePicture, email, recentOrders { ... }, friends { ... } } }`를 요청한다. 하나의 API 엔드포인트로 두 가지 요구를 Over-fetching 없이 처리한다. A는 중복 유지가 복잡하다. B와 D는 서버에서 분기 로직이 복잡해지고 유지보수가 어렵다.

---

**문제 4.** Step Functions 워크플로에서 Lambda 함수가 `PaymentDeclinedException`을 throw했다. 이미 처리된 재고 예약을 되돌려야 한다. 어떻게 설정하는가?

A) Lambda 함수 내부에서 try-catch로 재고를 직접 되돌린다
B) Step Functions Catch 블록에서 PaymentDeclinedException을 잡아서 재고 취소 Lambda로 라우팅한다 (Saga 패턴)
C) EventBridge Rule에서 Step Functions 실패 이벤트를 감지하고 처리한다
D) CloudWatch Alarm으로 Lambda 오류를 감지하고 수동으로 처리한다

**정답: B**

해설: Step Functions의 Catch 블록은 특정 오류 유형에 대해 다른 상태로 전이하는 Saga 패턴을 구현한다. PaymentDeclinedException 발생 시 재고 취소 Lambda를 호출하는 보상 트랜잭션을 구성할 수 있다. 이것이 분산 트랜잭션의 결과적 일관성을 달성하는 표준 방법이다. A는 결제 Lambda에 재고 취소 로직이 결합되어 관심사 분리 원칙에 위반된다. C는 EventBridge는 추가 지연이 있고 Step Functions의 컨텍스트 데이터 접근이 복잡하다. D는 수동 처리라서 자동화가 아니다.

---

**문제 5.** 협업 문서 편집 앱에서 여러 사용자가 같은 문서를 동시에 편집할 때, 한 사용자의 변경 사항이 다른 모든 사용자에게 실시간으로 반영되어야 한다. 가장 적합한 AWS 서비스 조합은?

A) API Gateway REST API + S3 + CloudFront
B) AppSync GraphQL + Subscription (WebSocket 기반 실시간 Push)
C) API Gateway WebSocket API + Lambda + DynamoDB
D) SNS + Lambda + SQS

**정답: B**

해설: AppSync의 Subscription은 이 시나리오에 완벽하게 맞는다. 사용자가 문서를 편집하면 Mutation이 실행되고, 같은 문서를 구독 중인 모든 사용자에게 변경 사항이 자동으로 Push된다. Amplify DataStore를 함께 사용하면 오프라인 동기화까지 지원된다. C도 가능하지만 WebSocket API + Lambda로 구독/연결 관리 로직을 직접 구현해야 해서 복잡도가 높다. AppSync는 이 로직을 내장하고 있어서 훨씬 적은 코드로 구현 가능하다.

---

**문제 6.** Step Functions와 Lambda를 조합해서 이미지 처리 파이프라인을 만든다. 각 단계(리사이징, 워터마크 추가, S3 업로드)는 Lambda로 구현되어 있다. 이 파이프라인에 Standard와 Express 중 어느 것이 더 적합하며, 이유는?

A) Standard — 각 단계의 실행 이력이 콘솔에서 쉽게 추적 가능하다
B) Express — 이미지 처리는 수 초 내에 완료되고 대량 처리가 필요하며, CloudWatch Logs로 충분히 모니터링 가능하다
C) Standard — 결제 처리가 포함되므로 exactly-once 보장이 필요하다
D) Express — 5분 안에 처리되므로 모든 워크플로는 Express가 맞다

**정답: B**

해설: 이미지 처리 파이프라인은 수 초 내에 완료되고(5분 한도 이내), 하루 수만~수십만 건의 이미지를 처리하는 높은 처리량이 필요하다. Express Workflow는 초당 100,000건 이상 처리가 가능하고 비용도 Standard보다 훨씬 저렴하다. CloudWatch Logs로 실행 로그를 볼 수 있어 디버깅도 가능하다. 이미지 처리는 동일 이미지를 재처리해도 결과가 같으므로 at-least-once 의미론의 Express도 안전하다. A는 Standard도 되지만 비용과 처리량 측면에서 불리하다. C는 이미지 처리 파이프라인에 결제가 포함되지 않는다. D는 5분 이내라고 항상 Express가 맞지 않다 — 처리량과 의미론도 고려해야 한다.

---
