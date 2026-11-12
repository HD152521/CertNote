# Day 54 - Step Functions, AppSync

📅 Date: July 29, 2026 (Wednesday)  
🎯 Topic: AWS Step Functions & AppSync  
⏱️ Study Time: Approximately 90 minutes

---

## 🎯 Learning Objectives

- Orchestrate complex workflows with Step Functions
- Implement GraphQL API with AppSync
- Understand application patterns in serverless architecture

---

## 📖 Theory Content

### 1. What is AWS Step Functions?

A serverless workflow service that visually orchestrates Lambda functions and AWS services.

**Problems Solved:**
- Reduced code complexity when chaining Lambda functions
- Parallel processing, conditional processing, retry logic
- Workflow state visualization

### 2. Step Functions State Types

```json
{
  "Comment": "Order processing workflow",
  "StartAt": "ValidateOrder",
  "States": {
    "ValidateOrder": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:ValidateOrder",
      "Next": "CheckInventory",
      "Catch": [
        {
          "ErrorEquals": ["ValidationError"],
          "Next": "OrderFailed"
        }
      ]
    },
    "CheckInventory": {
      "Type": "Task",
      "Resource": "arn:aws:lambda:...:CheckInventory",
      "Next": "ProcessPayment"
    },
    "ProcessPaymentAndNotify": {
      "Type": "Parallel",
      "Branches": [
        {
          "StartAt": "ProcessPayment",
          "States": {
            "ProcessPayment": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:...:ProcessPayment",
              "End": true
            }
          }
        },
        {
          "StartAt": "SendNotification",
          "States": {
            "SendNotification": {
              "Type": "Task",
              "Resource": "arn:aws:lambda:...:SendNotification",
              "End": true
            }
          }
        }
      ],
      "Next": "OrderSuccess"
    },
    "OrderSuccess": {
      "Type": "Succeed"
    },
    "OrderFailed": {
      "Type": "Fail",
      "Error": "OrderError",
      "Cause": "Order processing failed"
    }
  }
}
```

**State Types:**
- `Task`: Invoke Lambda/service
- `Choice`: Conditional branching
- `Parallel`: Execute in parallel
- `Wait`: Wait
- `Succeed/Fail`: Termination

### 3. Step Functions Retry and Error Handling

```json
{
  "ProcessPayment": {
    "Type": "Task",
    "Resource": "arn:aws:lambda:...",
    "Retry": [
      {
        "ErrorEquals": ["Lambda.ServiceException"],
        "IntervalSeconds": 2,
        "MaxAttempts": 3,
        "BackoffRate": 2.0
      }
    ],
    "Catch": [
      {
        "ErrorEquals": ["States.ALL"],
        "Next": "HandleError"
      }
    ]
  }
}
```

### 4. AWS AppSync

A fully managed service for GraphQL APIs.

```graphql
# Define GraphQL schema
type Order {
  orderId: ID!
  userId: String!
  amount: Float!
  status: String!
  createdAt: String!
}

type Query {
  getOrder(orderId: ID!): Order
  listOrders(userId: String!): [Order]
}

type Mutation {
  createOrder(userId: String!, amount: Float!): Order
  updateOrderStatus(orderId: ID!, status: String!): Order
}

type Subscription {
  onOrderStatusUpdate(orderId: ID!): Order
  @aws_subscribe(mutations: ["updateOrderStatus"])
}
```

**AppSync Data Sources:**
- DynamoDB
- Lambda
- RDS (RDS Proxy)
- HTTP endpoints
- Elasticsearch/OpenSearch
- EventBridge

### 4-1. Step Functions Standard vs Express (Exam Very Frequent)

| Item | Standard | Express |
|------|----------|---------|
| Maximum execution time | **1 year** | **5 minutes** |
| Execution model | Exactly once | At-least-once |
| Execution history | CloudWatch + Console (90 days) | CloudWatch Logs only |
| Pricing model | Per state transition ($0.025/1000) | Per execution time + memory |
| Throughput | 2,000 starts/s | 100,000 starts/s |
| Use | Long workflows (human approval, deployment) | Short frequent (event processing) |

### 4-2. Step Functions New State Types

| State | Purpose |
|------|------|
| **Task** | Work (Lambda, SNS, SQS, ECS, Glue etc., 100+ services) |
| **Choice** | Conditional branching |
| **Parallel** | Execute multiple branches simultaneously |
| **Map** | Iterate over array items (parallel) |
| **Wait** | Wait |
| **Pass** | Data transformation only |
| **Succeed / Fail** | Termination |

### Distributed Map (2022 New)

- Parallel process large volumes (thousands simultaneous)
- Per S3 object, per JSON array item
- Exam occasionally: "Process 100 million S3 files" → Distributed Map

### Task Service Integration Patterns (Exam Frequent)

| Pattern | URI Format | Behavior |
|--------|----------|------|
| **Request Response** | `arn:aws:states:::lambda:invoke` | Invoke and return response |
| **Run a Job (.sync)** | `arn:aws:states:::ecs:runTask.sync` | Wait until completion |
| **Wait for Callback (.waitForTaskToken)** | `arn:aws:states:::sqs:sendMessage.waitForTaskToken` | Wait for external callback token |

> 💡 .waitForTaskToken: Used for human approval, external system response wait, etc.

### 4-3. AppSync Details

- **Resolver**: Map GraphQL field → data source (VTL or JavaScript)
- **Pipeline Resolver**: Chain multiple resolver steps
- **Caching**: Server-side result caching
- **WAF Integration**: Possible
- **Authentication Methods**: API_KEY / IAM / Cognito User Pool / OIDC / Lambda Authorizer

### AppSync vs API Gateway (Exam Occasionally)

| Item | AppSync | API Gateway |
|------|---------|-------------|
| Protocol | GraphQL + WebSocket | REST + HTTP + WebSocket |
| Data sources | Multiple (single query) | Single backend |
| Real-time subscriptions | ✅ Built-in | WebSocket API separate |
| Caching | Response level | Method level |
| Use | Mobile, complex queries | General REST API |

### Step Functions Usage Patterns (Exam Scenarios)

| Pattern | Description |
|--------|------|
| **Saga** | Distributed transaction compensation |
| **Long-Running ETL** | Glue + Athena + Lambda |
| **Human Approval** | .waitForTaskToken |
| **Retry + Backoff** | Retry policy |
| **Parallel Validation** | Parallel state |
| **Map (Array Processing)** | Map state |

### Related Service Cross-Reference

- **Step Functions ↔ Lambda 15 min limit bypass**
- **AppSync ↔ Cognito** → [Week 9 Day 3] Authentication
- **Step Functions ↔ EventBridge** → Workflow trigger
- **AppSync ↔ DynamoDB** → Direct integration (CRUD without Lambda)

### 5. AppSync Real-Time Subscriptions

```javascript
// Client-side real-time subscription
import { API, graphqlOperation } from 'aws-amplify';

const subscription = API.graphql(
    graphqlOperation(`
        subscription OnOrderUpdate($orderId: ID!) {
            onOrderStatusUpdate(orderId: $orderId) {
                orderId
                status
                updatedAt
            }
        }
    `, { orderId: 'O001' })
).subscribe({
    next: (event) => {
        console.log('Order status update:', event.value.data.onOrderStatusUpdate);
    }
});
```

---

## Architecture Diagram

```
Step Functions Order Workflow
================================

[Create Order]
     |
     v
[ValidateOrder] → Failure → [OrderFailed]
     |
     v
[CheckInventory] → No inventory → [RefundOrder]
     |
     v
[Parallel]
  +-- [ProcessPayment]
  +-- [SendConfirmEmail]
  +-- [UpdateInventory]
     |
     v (All success)
[OrderSuccess]

AppSync GraphQL Architecture
================================

[Mobile/Web Client]
     |
     | GraphQL Query/Mutation
     v
[AWS AppSync]
     |
     +-- Query → [DynamoDB] (Data retrieval)
     |
     +-- Mutation → [Lambda] (Business logic)
     |
     +-- Subscription → [Real-time updates]
                        (WebSocket)
```

---

## ⭐ Key Points

1. ⭐ **Step Functions**: Workflow orchestration, visual state machine
2. ⭐ **Parallel State**: Concurrent execution, proceed after all complete
3. ⭐ **Retry/Catch**: Auto retry, error-specific branching
4. ⭐ **AppSync**: GraphQL, real-time subscriptions (WebSocket), offline support
5. ⭐ **AppSync Data Sources**: DynamoDB, Lambda, RDS, HTTP

---

## 📝 Practice Questions

**Question 1.** What is the best way to execute multiple Lambda functions sequentially and handle errors?

A) Lambda functions directly invoke other Lambda  
B) Step Functions workflow  
C) SQS chain  
D) EventBridge rules  

**Answer: B** - Step Functions orchestrates Lambda functions with error handling, retry, and branching visually.

---

**Question 2.** What state type executes multiple tasks simultaneously in Step Functions?

A) Choice  
B) Task  
C) Parallel  
D) Map  

**Answer: C** - Parallel state executes multiple branches simultaneously and proceeds after all complete.

---

**Question 3.** Which is NOT an advantage of AppSync?

A) GraphQL API support  
B) Real-time subscriptions (WebSocket)  
C) Supports only relational queries  
D) Offline data synchronization  

**Answer: C** - AppSync supports GraphQL with DynamoDB, Lambda, RDS, and other diverse data sources.

---

**Question 4.** To auto-retry when API rate limiting (ThrottlingException) occurs in Step Functions?

A) Write retry logic inside Lambda function  
B) Specify BackoffRate and MaxAttempts in Retry setting  
C) Configure DLQ  
D) Set alarm  

**Answer: B** - Step Functions Retry setting can configure exponential backoff and max retry attempts.

---

**Question 5.** To receive real-time order status updates in mobile app?

A) Periodically poll API  
B) AppSync GraphQL subscription  
C) SNS Push notification  
D) SQS Long Polling  

**Answer: B** - AppSync GraphQL subscription pushes real-time updates via WebSocket from server to client.

---

**Question 6.** Which statement about the difference between Step Functions Standard and Express is correct?

A) Standard can run for 5 minutes, Express for 1 year
B) Standard runs up to 1 year with exactly-once; Express runs up to 5 minutes with at-least-once and high throughput
C) Both guarantee exactly-once
D) Express is better suited for longer workflows

**Answer: B** - **Standard** runs up to 1 year, is exactly-once, and is billed per state transition, so it suits long and critical workflows (human approval, payments). **Express** runs up to 5 minutes, is at-least-once (duplicates possible), is billed by execution time, and supports up to 100,000 starts/s, so it suits short, frequent, idempotent processing. A swaps the two, C is wrong because Express is at-least-once, and D is the opposite because Standard is for long workflows.

---

**Question 7.** What is the key reason GraphQL is more efficient than REST in mobile environments?

A) GraphQL is always faster
B) The client declares the shape of the data it needs in a single query, reducing both over-fetching and under-fetching (multiple round trips)
C) GraphQL does not need caching
D) REST does not work on mobile

**Answer: B** - REST returns a fixed response per endpoint, which causes **over-fetching** (receiving unneeded fields) and **under-fetching (N+1 round trips)** when one screen needs multiple calls. On mobile, round trips and data charges are expensive, so this was a problem; GraphQL lets the client declare the shape of the data it needs in a single query, reducing both at once. A) It is not always faster and can cause server-side N+1. C) Caching is still useful (AppSync provides it too). D) REST works fine on mobile as well.

---

## 📌 Today's Summary

1. Step Functions: Visual workflow, Lambda orchestration
2. State types: Task, Choice, Parallel, Wait, Succeed, Fail
3. Error handling: Retry (auto-retry), Catch (error-specific branching)
4. AppSync: Fully managed GraphQL, real-time subscriptions, offline sync
5. AppSync data sources: DynamoDB, Lambda, RDS, HTTP, OpenSearch
