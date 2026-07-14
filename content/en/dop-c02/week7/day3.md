# Day 3 - API Gateway and Serverless Integrations

## API Gateway: Serverless API Frontend

API Gateway is HTTP/REST API service fronting Lambda, ECS, HTTP endpoints. Handles scaling, throttling, CORS, request/response transformation.

Creating REST API with Lambda integration:
```bash
# Create REST API
API_ID=$(aws apigateway create-rest-api \
  --name checkout-api \
  --description "E-commerce checkout" \
  --query 'id' --output text)

# Get root resource
RESOURCE_ID=$(aws apigateway get-resources \
  --rest-api-id $API_ID \
  --query 'items[0].id' --output text)

# Create /orders resource
ORDERS_RESOURCE=$(aws apigateway create-resource \
  --rest-api-id $API_ID \
  --parent-id $RESOURCE_ID \
  --path-part orders \
  --query 'id' --output text)

# Create POST method
aws apigateway put-method \
  --rest-api-id $API_ID \
  --resource-id $ORDERS_RESOURCE \
  --http-method POST \
  --authorization-type NONE

# Integrate with Lambda
aws apigateway put-integration \
  --rest-api-id $API_ID \
  --resource-id $ORDERS_RESOURCE \
  --http-method POST \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri arn:aws:apigateway:region:lambda:path/2015-03-31/functions/arn:aws:lambda:region:account:function:checkout/invocations

# Deploy to stage
aws apigateway create-deployment \
  --rest-api-id $API_ID \
  --stage-name prod
```

**Throttling and Caching**:
```bash
# Method-level throttling
aws apigateway update-stage \
  --rest-api-id $API_ID \
  --stage-name prod \
  --patch-operations \
    op=replace,path=*/*/*/throttle/rateLimit,value=10000 \
    op=replace,path=*/*/*/throttle/burstLimit,value=5000

# Enable method caching
aws apigateway update-method \
  --rest-api-id $API_ID \
  --resource-id $ORDERS_RESOURCE \
  --http-method GET \
  --patch-operations \
    op=replace,path=/cacheTtlInSeconds,value=300
```

> 💡 **CloudFront Integration**: API Gateway fronted by CloudFront caches responses at edge, reducing API Gateway load. Typically for GET requests with cache headers.

## HTTP APIs vs REST APIs

HTTP APIs (newer, simpler) vs REST APIs (comprehensive, feature-rich).

| Feature | HTTP API | REST API |
|---------|----------|----------|
| Cost | Lower (per million calls) | Higher |
| Cold start | Generally faster | Slower |
| Authorization | IAM, OIDC, custom | IAM, API Key, Lambda |
| Caching | Limited | Full |
| Use Case | Simple microservices | Complex integrations |

HTTP API suitable for simple Lambda proxy; REST API for complex transformation and caching needs.

## EventBridge: Event-Driven Serverless

EventBridge routes events from AWS services, custom applications, SaaS to targets (Lambda, SQS, SNS, etc.).

Rule pattern matching:
```json
{
  "source": ["aws.ec2"],
  "detail-type": ["EC2 Instance State-change Notification"],
  "detail": {
    "state": ["running"]
  }
}
```

When EC2 instance starts, EventBridge rule triggers Lambda to auto-provision monitoring.

> 📚 **Case**: Serverless data pipeline. S3 upload → EventBridge → Lambda extracts data → RDS write. Automatic, no polling, event-driven.

## SQS and SNS: Async Messaging Patterns

**SQS (Simple Queue Service)**: Reliable message queue. Decouples producer from consumer.

```bash
# Send message
aws sqs send-message \
  --queue-url https://sqs.region.amazonaws.com/account/checkout-queue \
  --message-body '{"order_id": "12345"}'

# Lambda polls queue
# Event Source Mapping: SQS → Lambda automatic polling
aws lambda create-event-source-mapping \
  --event-source-arn arn:aws:sqs:region:account:checkout-queue \
  --function-name process-order
```

**SNS (Simple Notification Service)**: Pub/Sub. Publisher sends once; multiple subscribers receive.

```bash
# Publish to topic
aws sns publish \
  --topic-arn arn:aws:sns:region:account:order-shipped \
  --message "Order 12345 shipped"

# Lambda subscribed to topic
aws sns subscribe \
  --topic-arn arn:aws:sns:region:account:order-shipped \
  --protocol lambda \
  --notification-endpoint arn:aws:lambda:region:account:function:notify-customer
```

> 🔍 **SQS vs SNS**: Use SQS for decoupling producer/consumer (fan-out within same system). Use SNS for broadcasting (same message to different systems). Combine: SNS publishes to SQS queue(s) for persistent subscriber-specific processing.

---

## 📝 연습 문제

**문제 1.** API Gateway에서 throttling을 설정하는 목적은?

A) Lambda 함수 실행 시간 제한  
B) API 요청 속도 제한으로 DDoS 방어, 비용 제어  
C) API 응답 캐싱  
D) CORS 정책 관리  

**정답: B**
해설: Throttling은 계정당 또는 메서드당 요청률을 제한한다. 악의적 요청 방어 및 Lambda 동시 실행 제한으로 비용 폭발 방지.

---

**문제 2.** 다수의 서로 다른 시스템이 동일한 메시지를 처리해야 한다면?

A) SQS 큐에 메시지 저장  
B) SNS 토픽에 발행 후 각 시스템이 구독  
C) Lambda에서 매번 외부 API 호출  
D) S3에 메시지 저장  

**정답: B**
해설: SNS pub/sub 패턴이 한 메시지를 여러 구독자가 독립적으로 수신하는 경우에 적합하다. SQS는 하나의 컨슈머만 메시지를 처리한다.

---

**문제 3.** Lambda가 비동기 작업을 처리하고 싶을 때?

A) API Gateway에서 동기 호출  
B) SQS 큐 → EventBridge 패턴  
C) SQS 큐를 Event Source로 Lambda 매핑, 또는 SNS 토픽 구독  
D) S3 폴링  

**정답: C**
해설: Lambda Event Source Mapping이 SQS를 폴링하거나 SNS 토픽 구독으로 Lambda를 자동 트리거한다. 비동기 처리의 표준.

---
