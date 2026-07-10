# Day 3 - Step Functions and AppSync: Orchestration and GraphQL

A single Lambda function handling a single task is simple. But what happens when several steps — validation → inventory check → payment → shipping request → notification, as in order processing — are linked together with an order and conditions, and you try to code that flow directly inside Lambda? Each Lambda calls the next one, cancels the previous step on failure, and tracks how far things have completed — and all of that code gets tangled up with the Lambda's business logic. Step Functions pulls this flow control out of the code and defines it as a visual state machine.

This kind of orchestration problem is especially acute in a microservices architecture. As the number of services grows, the coordination logic between services ends up scattered across each service. The Choreography approach — where one service calls the next directly — is loosely coupled and event-driven, but it makes the overall flow hard to grasp at a glance. Step Functions' Orchestration approach lets you define and visualize the flow centrally, which is an advantage when tracking complex business processes.

## Step Functions — Expressing Workflows as State Machines

Step Functions defines workflows in a JSON-based language called Amazon States Language (ASL). In ASL, everything is a "State," and there are Transitions between states. The Step Functions service tracks and persists where each step of a running workflow is, what data it holds, and what has failed. Lambda is merely a "worker" invoked by this state machine.

### Standard vs Express — Two Modes

| Item | Standard | Express |
|------|----------|---------|
| Max execution time | 1 year | 5 minutes |
| Execution semantics | Exactly-once | Async: At-least-once / Sync: At-most-once |
| Execution history | Detailed tracing in the AWS console | Must be stored separately via CloudWatch Logs |
| Cost | Billed per state transition | Billed on execution count + execution duration |
| Throughput | 2,000 executions per second | Over 100,000 executions per second |
| Suitable workload | Long-running business processes, human approval | High-volume short workflows (IoT, streaming, ETL) |

Standard guarantees "exactly-once" semantics for each state transition. It's well suited to tasks where duplicate execution is catastrophic, such as payment processing or sending email. Express is used when you need high throughput capable of handling over 100,000 executions per second. It fits short IoT event processing and streaming data transformation.

> 💡 **The distributed-systems theory of exactly-once** — "Exactly-once" is one of the hardest guarantees in distributed systems. When a network failure occurs, retrying gives you at-least-once (duplicates possible), while not retrying gives you at-most-once (loss possible). Step Functions Standard implements exactly-once internally through a distributed log and an idempotency mechanism. This implementation is based on a consensus algorithm similar to Leslie Lamport's Paxos (1989). That this guarantee comes at a performance cost is why Standard is more expensive and lower-throughput than Express. Express's at-least-once is only safe for idempotent operations that can tolerate duplicate processing.

### Core State Types

**Task state**: Performs actual work such as invoking Lambda, starting an ECS task, writing to DynamoDB, sending an SQS message, or SageMaker training. With SDK Integration you can call over 200 AWS services directly, so you can compose AWS services even without Lambda.

**Choice state**: Conditional branching. Transitions to different states depending on a particular value. The declarative expression of `if-else`.

**Parallel state**: Runs multiple branches simultaneously and waits until all of them complete. Run a credit check and an identity verification at the same time, and move to the next step only after both finish.

**Map state**: Repeats the same processing for each item in an array. Distributed Map supports up to 10,000 parallel executions and is optimized for processing arrays of S3 objects.

**Wait state**: Waits until a specified duration or a particular timestamp. Check the payment status 3 seconds after payment processing, send a reminder 24 hours after a reservation, and so on.

**waitForTaskToken**: The long-wait pattern. In a Task state, a task token is passed to an external system (a human, an external API, a legacy system), and Step Functions waits until that system sends back a callback including the token. No cost is incurred while waiting, and it can wait up to a year.

```json
// waitForTaskToken example (human approval — payment processing)
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

When the approver receives the SQS message, reviews it, and calls `SendTaskSuccess(taskToken)` or `SendTaskFailure(taskToken)`, the workflow resumes.

> 📚 **Intuit TurboTax Step Functions case study** — In 2021, Intuit (TurboTax, QuickBooks) presented at AWS re:Invent a case study of implementing its tax-filing processing workflow with Step Functions Standard. The tax-filing process has these steps: data validation → calculation → submission to government agencies → waiting for confirmation (up to several hours) → notifying the result. In particular, at the government-agency confirmation-wait step, they used waitForTaskToken to wait statelessly until the government response actually arrived. With this pattern they process millions of tax filings per month. In the past they implemented it with a polling loop inside Lambda, but they announced that switching to Step Functions + waitForTaskToken cut costs by 90%.

### Error Handling — Retry and Catch

In Step Functions, every Task state can have `Retry` and `Catch`.

**Retry**: For a specific error type, you set the number of retries, the initial delay, and the backoff multiplier.

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

Up to 3 retries at intervals of 2s → 4s → 8s (exponential backoff). If all fail, control passes to Catch.

**Catch**: Catches a specific error and routes to a different state. The compensating transaction of the Saga pattern is implemented here.

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

On payment failure, connect to a compensating transaction that releases the inventory again. `States.ALL` is a wildcard that catches all errors.

> 🔍 **The academic origin of the Saga pattern and its Step Functions implementation** — The Step Functions Saga pattern implements the distributed-transaction pattern proposed in Hector Garcia-Molina and Kenneth Salem's 1987 paper "Sagas" (ACM SIGMOD). In a microservices environment, processing a transaction spanning multiple services atomically with 2PC (Two-Phase Commit) causes performance degradation and availability problems. The Saga pattern defines a "Compensating Transaction" for each step to roll back the previous steps on failure. Step Functions' Catch + a call to a compensating Lambda function is the cloud implementation of this pattern. The key is achieving an "Eventually Consistent" state through compensating transactions rather than a full ACID transaction.

> ⚠️ **The 256KB data limit** — The input/output data passed between Step Functions states has a 256KB limit. When a Lambda execution result is large (several MB of data), you must use a pattern where Lambda stores the result in S3 and passes only the S3 URI to Step Functions. Exceeding 256KB causes the execution to fail. When processing large data, you must use S3 as intermediate storage.

### Distributed Map — Massively Parallel Processing

Distributed Map is used when processing millions of S3 objects in parallel, or processing each item of a large array simultaneously. It supports up to 10,000 concurrent executions.

A real-world example: aggregating 10,000 CSV files in an S3 bucket by processing each one with Lambda. Without Distributed Map, you'd have to call Lambda sequentially or implement complex parallel-processing logic yourself.

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

`ToleratedFailurePercentage`: Allow some failures and still count the whole Map as a success. Useful for data processing where 80% success is acceptable rather than 100% perfection.

## AppSync — Managed GraphQL Service

GraphQL is an API query language that Facebook developed internally in 2012 and open-sourced in 2015. It was designed to solve REST API's problems of Over-fetching (returning more data than needed) and Under-fetching (requiring multiple requests).

The core difference of GraphQL: the client specifies the fields it needs.

```graphql
# REST API approach: requires calling multiple endpoints
# GET /users/123  → { id, name, email, age, address, ... }  # Over-fetching
# GET /users/123/orders  → a separate call  # Under-fetching (N+1 problem)

# GraphQL approach: in one shot, only what you need
query {
  user(id: "123") {
    name                         # requests only name (no Over-fetching)
    recentOrders(limit: 5) {     # related data too, in one query (no Under-fetching)
      orderId
      totalAmount
      status
    }
  }
}
```

AppSync provides this GraphQL in a managed form. Schema definition → Resolver configuration → backend connection is done declaratively.

### Data Sources and Resolvers

AppSync connects various data sources through Resolvers.

- **DynamoDB**: Direct calls such as GetItem, Query, PutItem (without Lambda)
- **Aurora Serverless**: SQL execution via the RDS Data API
- **Lambda**: Complex business logic, combining multiple sources
- **OpenSearch**: Full-text search
- **HTTP**: Calling external REST APIs
- **EventBridge**: Publishing events

**Pipeline Resolver**: Chains multiple functions to resolve a single GraphQL field. Compose complex logic like "look up user → check permissions → return data" without code.

```
Pipeline Resolver execution order:
Before Mapping Template
→ Function 1 (e.g., permission check)
→ Function 2 (e.g., data lookup)
→ Function 3 (e.g., result transformation)
→ After Mapping Template
→ return to client
```

### Real-Time Subscriptions

One of AppSync's powerful features is GraphQL Subscription. When a specific Mutation occurs, it automatically pushes to subscribers.

```graphql
# Mutation: send a new message
mutation SendMessage {
  sendMessage(roomId: "room1", text: "Hello") {
    messageId
    text
    timestamp
  }
}

# Subscription: receive new messages (another client registers)
subscription OnNewMessage {
  onCreateMessage(roomId: "room1") {
    messageId
    text
    sender { name }
    timestamp
  }
}
```

When a client starts a Subscription, a WebSocket connection opens, and every time someone runs the `sendMessage` Mutation, it's automatically pushed to subscribers. It's a perfect pattern for chat, collaboration tools, and real-time feeds.

> 💡 **The GraphQL N+1 problem and the DataLoader solution** — The GraphQL N+1 problem occurs when processing relational data. For example, if you fetch a list of 100 users (`1 query`) and then fetch each user's recent orders, 100 additional queries occur (`N queries`, 1+N total). Facebook developed a batch-loading library called DataLoader to solve this. It collects individual requests and processes them in a batch — gathering 100 userIds and looking them up at once with `BatchGetItem`. AppSync also mitigates this problem with DynamoDB BatchGetItem integration and Pipeline Resolvers. When using a Lambda Resolver, you either implement DataLoader yourself or leverage AppSync's batching capability.

> 🔍 **AppSync Caching** — AppSync supports per-resolver caching. Caching a particular query's response for a TTL can reduce DynamoDB/Lambda calls. Cache sizes range from t2.micro up to r4.8xlarge. Unlike REST API's whole-response caching, AppSync lets you control the cache at the field level, so you can cache frequently changing fields and stable fields differently. Subscription data is not cached (always real-time).

### AppSync vs API Gateway — Selection Criteria

| Criterion | AppSync | API Gateway |
|------|---------|------------|
| Query language | GraphQL | REST/HTTP |
| Field selection | Decided by the client | Decided by the server |
| Multiple data sources | Multiple sources in one query | One per endpoint |
| Real-time Push | Subscription (WebSocket) | WebSocket API (implement yourself) |
| N+1 problem solution | DataLoader + Pipeline Resolver | None |
| Caching | per-resolver caching | Whole-response caching (REST only) |
| Type system | GraphQL Schema (strongly typed) | OpenAPI/Swagger |
| Primary use case | Mobile/web apps, diverse clients | Microservices REST APIs |

Scenarios where AppSync is a good fit:
- When a mobile app and a web app share the same API but need different data
- When you need to combine and display data from multiple microservices on one screen
- Collaboration tools, chat, and social feeds that need real-time updates
- Mobile apps that need offline synchronization (Amplify DataStore)

Scenarios where API Gateway is a good fit:
- Simple RESTful CRUD APIs
- Partner APIs (need API Key + Usage Plan)
- When compatibility with existing REST clients is required
- When you need to implement WebSocket directly (finer control than AppSync)

Comparison with other clouds:

| Item | AWS AppSync | GCP Firebase/GraphQL | Azure API Management |
|------|------------|---------------------|---------------------|
| Managed GraphQL | O (AppSync) | X (implement yourself) | X (implement yourself) |
| Real-time subscription | O (WebSocket) | O (Realtime DB, Firestore) | X |
| Offline synchronization | O (Amplify DataStore) | O (Firestore offline) | X |
| Backend integration | DDB/Lambda/RDS/OpenSearch/HTTP | Firestore/Cloud Functions | Own APIs |

## Configuring Step Functions and AppSync via the CLI

```bash
# Create a Step Functions Standard state machine (order-processing workflow)
aws stepfunctions create-state-machine \
  --name OrderProcessingFlow \
  --role-arn arn:aws:iam::111:role/stepfunctions-role \
  --type STANDARD \
  --definition '{
    "Comment": "Order-processing workflow",
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
          "Message.$": "States.Format('"'"'Order {} processing complete'"'"', $.orderId)"
        },
        "End": true
      },
      "OrderFailed": {
        "Type": "Fail",
        "Error": "OrderProcessingFailed"
      }
    }
  }'

# Create an Express state machine (IoT event processing — high throughput)
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

# Start a state machine execution
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:ap-northeast-2:111:stateMachine:OrderProcessingFlow \
  --input '{"orderId": "ord-001", "productId": "prod-001", "amount": 29900}'

# Retrieve execution history
aws stepfunctions get-execution-history \
  --execution-arn arn:aws:states:ap-northeast-2:111:execution:OrderProcessingFlow:exec-uuid

# Create an AppSync API (Cognito + API Key auth)
aws appsync create-graphql-api \
  --name prod-graphql-api \
  --authentication-type AMAZON_COGNITO_USER_POOLS \
  --user-pool-config userPoolId=ap-northeast-2_xxx,awsRegion=ap-northeast-2,defaultAction=ALLOW \
  --additional-authentication-providers '[{"authenticationType": "API_KEY"}]'

# Connect an AppSync DynamoDB data source
aws appsync create-data-source \
  --api-id api-id \
  --name OrdersTable \
  --type AMAZON_DYNAMODB \
  --service-role-arn arn:aws:iam::111:role/appsync-ddb-role \
  --dynamodb-config tableName=Orders,awsRegion=ap-northeast-2

# Enable AppSync caching (per-resolver TTL)
aws appsync update-graphql-api \
  --api-id api-id \
  --caching-config ttl=300,cachingKeys="\$context.arguments.id"

# Create an AppSync API Key (for dev/test)
aws appsync create-api-key \
  --api-id api-id \
  --expires 1800000000
```

## Wrapping Up

Step Functions is a service that orchestrates Lambda functions with a state-machine definition rather than code. Standard gives you exactly-once up to a year; Express gives you high-volume processing within 5 minutes. With waitForTaskToken you wait for human approval or an external callback, and with Distributed Map you declaratively compose 10,000-way parallel processing. Retry + Catch implements compensating transactions via the Saga pattern.

AppSync provides a GraphQL API in a managed form and makes real-time Push easy to implement with Subscription. Scenarios where diverse clients (mobile/web) must each fetch only the data they need, the Over-fetching/Under-fetching problem, and real-time collaboration are AppSync's natural use cases.

Tomorrow we head into the world of containers. We'll cover how ECS, EKS, Fargate, and ECR differ, and how to correctly manage IAM permissions from within containers.

---

## 📝 연습 문제

**문제 1.** You're implementing a loan-review workflow. Application received → credit check (automatic) → reviewer examination (human, up to 3 days) → approval/rejection notification. What is the most suitable Step Functions configuration for this workflow?

A) Express Workflow (fast processing)
B) Standard Workflow + waitForTaskToken (can wait up to 1 year, reviewer callback)
C) Standard Workflow + Wait state (3-day timer wait)
D) Express Workflow + Lambda polling (periodically check the review result)

**정답: B**

해설: The approval step involving a human requires waiting up to 3 days. Standard Workflow can run for up to a year, and waitForTaskToken waits at no cost until a callback arrives from outside. The task token is passed to the reviewer, and when the reviewer presses the approve/reject button, SendTaskSuccess/SendTaskFailure is called with that token and the workflow resumes. A is impossible — the 5-minute limit can't wait 3 days. C's Wait state is a fixed-duration wait, not a callback wait. D is unsuitable because of Express's 5-minute limit and the complexity of implementing polling.

---

**문제 2.** One million JSON files are uploaded to an S3 bucket every day. Each file must be processed with Lambda and the aggregated data stored in DynamoDB. What is the most efficient approach?

A) Trigger a Lambda that lists the S3 files and processes them sequentially
B) Step Functions Standard Workflow + Distributed Map (up to 10,000 parallel)
C) Put the file paths into SQS and have Lambda poll and process them
D) Run a per-file workflow with EventBridge + Step Functions Express

**정답: B**

해설: Distributed Map is optimized for reading the S3 object list directly and processing each object in parallel. Setting MaxConcurrency to 10,000 lets you process one million files in 100 batches. The results are automatically stored in S3. A is too slow because sequential processing takes far too long for one million files. C — SQS is a fine approach, but it requires separate S3 listing and queue-management logic and isn't as clean as Distributed Map. D — triggering a workflow for each and every file with EventBridge is excessive overhead.

---

**문제 3.** A mobile app and a web app use the same backend, but the mobile app has a small screen and needs only the user's name and profile picture, while the web app needs the full profile + the 10 most recent orders + the friends list. To handle both clients' needs efficiently with the same API, what should you do?

A) Create two REST APIs (one for mobile, one for web)
B) Branch the response by a client-type header in a single REST API
C) AppSync GraphQL API (the client specifies the fields it needs in the query)
D) Detect the client by User-Agent in Lambda and return different responses

**정답: C**

해설: The core advantage of GraphQL is precisely that the client can specify the fields it needs. The mobile app requests `{ user { name, profilePicture } }`, and the web app requests `{ user { name, profilePicture, email, recentOrders { ... }, friends { ... } } }`. A single API endpoint handles both needs with no Over-fetching. A is complex to maintain due to duplication. B and D make the server's branching logic complex and hard to maintain.

---

**문제 4.** In a Step Functions workflow, a Lambda function threw a `PaymentDeclinedException`. You need to roll back an inventory reservation that has already been made. How do you configure this?

A) Roll back the inventory directly with try-catch inside the Lambda function
B) Catch PaymentDeclinedException in a Step Functions Catch block and route to an inventory-cancellation Lambda (Saga pattern)
C) Detect and handle the Step Functions failure event in an EventBridge Rule
D) Detect the Lambda error with a CloudWatch Alarm and handle it manually

**정답: B**

해설: A Step Functions Catch block implements the Saga pattern by transitioning to a different state for a specific error type. When PaymentDeclinedException occurs, you can configure a compensating transaction that calls an inventory-cancellation Lambda. This is the standard way to achieve eventual consistency in distributed transactions. A couples inventory-cancellation logic into the payment Lambda, violating the separation-of-concerns principle. C — EventBridge adds extra latency, and accessing Step Functions' context data is complex. D is manual handling, not automation.

---

**문제 5.** In a collaborative document-editing app, when multiple users edit the same document simultaneously, one user's changes must be reflected in real time to all other users. What is the most suitable AWS service combination?

A) API Gateway REST API + S3 + CloudFront
B) AppSync GraphQL + Subscription (WebSocket-based real-time Push)
C) API Gateway WebSocket API + Lambda + DynamoDB
D) SNS + Lambda + SQS

**정답: B**

해설: AppSync's Subscription fits this scenario perfectly. When a user edits the document, a Mutation runs, and the change is automatically pushed to all users subscribed to the same document. Using it together with Amplify DataStore even adds offline synchronization support. C is also possible, but you'd have to implement the subscription/connection-management logic yourself with WebSocket API + Lambda, which raises the complexity. AppSync has this logic built in, so it can be implemented with far less code.

---

**문제 6.** You're building an image-processing pipeline by combining Step Functions and Lambda. Each step (resizing, adding a watermark, uploading to S3) is implemented with Lambda. Which is more suitable for this pipeline, Standard or Express, and why?

A) Standard — the execution history of each step is easy to trace in the console
B) Express — image processing completes within a few seconds and needs high-volume processing, and CloudWatch Logs is sufficient for monitoring
C) Standard — payment processing is involved, so exactly-once guarantees are needed
D) Express — since it's processed within 5 minutes, every workflow should be Express

**정답: B**

해설: An image-processing pipeline completes within a few seconds (within the 5-minute limit) and needs high throughput, processing tens of thousands to hundreds of thousands of images a day. Express Workflow can handle over 100,000 executions per second and is far cheaper than Standard. You can view execution logs via CloudWatch Logs, so debugging is possible too. Image processing yields the same result even if the same image is reprocessed, so Express's at-least-once semantics is safe here. A — Standard works too, but it's disadvantageous in terms of cost and throughput. C — an image-processing pipeline doesn't involve payment. D — being within 5 minutes doesn't always mean Express is right; you must also consider throughput and semantics.

---
