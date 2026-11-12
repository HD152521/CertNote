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

## 📝 Practice Questions

**Question 1.** What is the purpose of configuring throttling in API Gateway?

A) Limiting Lambda function execution time  
B) Limiting the API request rate to defend against DDoS and control cost  
C) Caching API responses  
D) Managing the CORS policy  

**Answer: B**
Explanation: Throttling limits the request rate per account or per method. It defends against malicious requests and prevents cost explosions by limiting Lambda concurrent executions.

---

**Question 2.** What if multiple different systems must process the same message?

A) Store the message in an SQS queue  
B) Publish to an SNS topic and have each system subscribe  
C) Call an external API from Lambda each time  
D) Store the message in S3  

**Answer: B**
Explanation: The SNS pub/sub pattern is suited to cases where multiple subscribers independently receive one message. With SQS, only one consumer processes a message.

---

**Question 3.** What if Lambda needs to handle asynchronous work?

A) Synchronous invocation from API Gateway  
B) SQS queue → EventBridge pattern  
C) Map an SQS queue as the event source for Lambda, or subscribe to an SNS topic  
D) Polling S3  

**Answer: C**
Explanation: A Lambda event source mapping polls SQS, or an SNS topic subscription automatically triggers Lambda. This is the standard for asynchronous processing.

---
