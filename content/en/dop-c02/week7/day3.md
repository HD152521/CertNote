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

**Question 4.** How many versions can a Lambda alias's weighted routing point to at the same time?

A) 1 (primary only)  
B) 2 (primary + 1 additional)  
C) 3  
D) Unlimited — possible as long as the weights sum to 1.0  

**Answer: B**
Explanation: An alias can have `function-version` (primary) plus at most one additional version in `routing-config.AdditionalVersionWeights`. That is, a maximum 2-way split. A 3-way split such as "V5 70%, V6 20%, V7 10%" is not possible. This is the structural reason CodeDeploy Canary proceeds only "one step at a time." If you need a 3-way split, use an ALB weighted target group or Route 53 weighted routing. It is a frequent exam trap: answering "multiple versions can be distributed" is wrong.

---

**Question 5.** A Java Spring Boot Lambda function has an 8-second cold start that ruins P95 latency. What is the most effective solution?

A) Increase reserved concurrency  
B) Enable SnapStart + reset uniqueness with runtime hooks  
C) Use a Lambda layer  
D) Change the architecture to ARM (20% improvement)  

**Answer: B**
Explanation: SnapStart takes a memory snapshot of the JVM init phase and skips the init time, which accounts for 80 to 90% of the cold start. 8 seconds → 300 to 500 ms. Because Spring Boot's ApplicationContext initialization happens in the init phase, the effect is largest. However, parts that need uniqueness guarantees, such as random seeds and UUIDs, must be re-initialized in the `afterRestore` hook (otherwise every invocation generates the same UUID). A is a limit setting and unrelated to cold starts, C has a negligible effect, and D gives partial improvement but is not the primary solution.

---

**Question 6.** API Gateway invokes the Lambda alias `MyFn:live` and gets 403/Permission denied. What is the most likely cause?

A) A bug in the Lambda code  
B) `aws lambda add-permission` was run without `--qualifier live` → the permission applies only to the function ARN, and alias invocations are denied  
C) The IAM role is missing  
D) The VPC configuration is missing  

**Answer: B**
Explanation: Lambda resource policies are evaluated by ARN exactness. A permission on `arn:aws:lambda:...:MyFn` (unqualified) allows only `$LATEST` and unqualified invokes; invoking `arn:aws:lambda:...:MyFn:live` (qualified) requires a separate permission. This is a very common troubleshooting point on the exam and in practice. The console's "Add trigger" automatically grants a permission that includes the qualifier, but it is easy to miss when writing by hand with the CLI/CFN. The fix is to specify `add-permission --qualifier live`.

---

**Question 7.** Can alias weighted routing be used with `$LATEST`?

A) Yes  
B) No — versions must be positive integers (weighted routing on a mutable target is meaningless)  
C) Only supported in some Regions  
D) It can be worked around through a layer  

**Answer: B**
Explanation: `$LATEST` is a mutable working copy. Because the code changes every time, it fundamentally conflicts with the purpose of weighted routing, "comparing two different pieces of code." The Lambda API itself rejects `$LATEST` or non-numeric strings for `function-version` (`ValidationException`). PC likewise cannot be configured on `$LATEST` — code changes would invalidate the warm-up. The fix is to always create a numbered version with `publish-version` and use that.

---

**Question 8.** What is the most accurate difference between provisioned concurrency and reserved concurrency?

A) They are the same feature — only the names differ  
B) PC keeps pre-warmed containers (paid, eliminates cold starts), while reserved sets a concurrency limit (free, protects other functions)  
C) PC is free and reserved is paid  
D) Reserved eliminates cold starts and PC sets the concurrency limit  

**Answer: B**
Explanation: The exact distinction between the two concepts frequently appears on the exam. PC aims for "zero cold starts"; reserved aims to "cap this function so it cannot eat into other functions' concurrency." Invocations beyond the PC limit are handled as ordinary cold starts and are not rejected, but exceeding the reserved limit results in a 429 throttle. PC is billed per time in use, and reserved is free. Also, PC can be a subset of reserved (if PC is 10, reserved must be at least 10).

---

**Question 9.** What is the cost impact on a function with PC enabled during a canary deployment?

A) No change  
B) PC is temporarily active on both the old and new versions, so the PC cost roughly doubles (CodeDeploy allocates it automatically)  
C) PC is released automatically  
D) Cost decreases by 50%  

**Answer: B**
Explanation: During a canary shift the new version must also be warm to avoid cold starts, so SAM/CodeDeploy automatically allocates the same PC to the new version. The result is that PC cost temporarily doubles during deployment (for example, PC 10 on V5 + PC 10 on V6 = 20). When the shift completes to 100%, V5's PC is released automatically. When adopting PC for cost-sensitive workloads, you should calculate this in advance. A/C/D are not factual.

---

**Question 10.** After enabling SnapStart, a bug occurs where the same UUID is generated on every invocation. What is the cause and the fix?

A) A Lambda bug — contact AWS Support  
B) Because the snapshot is restored, the random seed from the init phase is the same in every invocation → reinitialize SecureRandom in the `afterRestore` hook of `org.crac.Resource`  
C) Upgrade the Java version to 17  
D) Add a layer  

**Answer: B**
Explanation: SnapStart is image-based persistence, so all memory state from the init phase is cloned. If `new SecureRandom()` is executed only once during init, it starts with the same entropy. You must reinitialize using a runtime hook (`org.crac.Core.getGlobalContext().register(this)`) in `afterRestore`, such as with `SecureRandom.getInstanceStrong()`. The same problem applies to DB connections, HTTP client pools, and file descriptors, all of which must be re-established through hooks. Uniqueness assumption violation is the most common security trap when adopting SnapStart.

---

**Question 11.** How do you implement Blue/Green by creating a function URL per alias?

A) A function URL can only be created for the whole function  
B) Create a URL per alias with `create-function-url-config --qualifier <alias>` → clients distribute traffic with Route 53 weighted records or CloudFront origin failover  
C) API Gateway is required  
D) Add a Lambda layer  

**Answer: B**
Explanation: A function URL (launched in 2022) can be created per version or alias with `--qualifier`. Creating a URL for each of the prod alias and the canary alias gives you two different endpoints. Client distribution is done with a Route 53 weighted record or CloudFront origin failover. It reduces latency and cost compared with API Gateway, but lacks features such as API keys, throttling, and request validation. A is not true, C is wrong because a key feature of function URLs is working without API Gateway, and D is unrelated.
