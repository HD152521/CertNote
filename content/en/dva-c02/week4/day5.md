# Day 5 - Week 4 Review: Sharpening Real Exam Instincts with Comprehensive API Gateway Scenarios

The API Gateway we covered in Week 4 is not a simple HTTP proxy. Three independent product families — REST API, HTTP API, and WebSocket API — implement different paradigms, each with different authentication methods, integration types, and performance characteristics. This review focuses less on reconfirming individual concepts and more on **edge cases and selection judgment**. DVA-C02 asks not "which service should I use" but "why is this configuration wrong" and "what is the root cause of this error". The scenario questions below are structured with the same kind of compound conditions that appear on the actual exam.

---

## Full Week 4 Spec Reference

### Complete Comparison of the Three API Gateway Types

| Feature | REST API | HTTP API | WebSocket API |
|------|----------|----------|---------------|
| **Protocol** | HTTP/1.1 | HTTP/1.1 | RFC 6455 WebSocket |
| **Communication direction** | Request-response | Request-response | Bidirectional |
| **Cost (per million calls)** | ~$3.50 | ~$1.00 | Connection time + message count |
| **Lambda Proxy integration** | ✅ | ✅ | ✅ |
| **VTL mapping templates** | ✅ | ❌ | ❌ |
| **Direct AWS Service integration** | ✅ | ❌ | ❌ |
| **MOCK integration** | ✅ | ❌ | ❌ |
| **IAM authentication** | ✅ | ✅ | ✅ |
| **Lambda Authorizer** | ✅ | ✅ | ✅ ($connect only) |
| **Cognito User Pool Authorizer** | ✅ | ❌ | ❌ |
| **JWT Authorizer** | ❌ | ✅ | ❌ |
| **API Key + Usage Plan** | ✅ | ❌ | ❌ |
| **Resource Policy** | ✅ | ❌ | ❌ |
| **mTLS** | ✅ | ✅ | ❌ |
| **WAF** | ✅ (direct) | ❌ (CF workaround) | ❌ |
| **Response caching** | ✅ | ❌ | ❌ |
| **Request Validation** | ✅ | ❌ | ❌ |
| **Gateway Response customization** | ✅ | ❌ | ❌ |
| **X-Ray Tracing** | ✅ | ❌ | ❌ |
| **Canary Deployment** | ✅ | ❌ | ❌ |
| **VPC Link backend** | NLB only | ALB/NLB/CloudMap | ❌ |
| **Automatic CORS setup** | ❌ (manual) | ✅ | N/A |
| **Payload Format** | Lambda Proxy format | v1.0 or v2.0 (default) | Separate |

### Authentication Method Selection Mapping

| Scenario | Recommended auth method |
|----------|---------------|
| AWS Lambda/EC2 calling an API in another account | IAM + SigV4 |
| External OAuth2 / custom JWT validation | Lambda Authorizer (TOKEN) |
| Composite validation of header + query + path | Lambda Authorizer (REQUEST) |
| Cognito User Pool users (REST API) | Cognito User Pool Authorizer |
| Cognito/Auth0/Okta JWT (HTTP API) | JWT Authorizer |
| Partner API usage tracking + quota | API Key + Usage Plan |
| Allow access only from inside a VPC | Resource Policy (SourceVpce) |
| IP whitelist | Resource Policy (SourceIp) |
| Cross-account API access | Resource Policy (Principal ARN) |
| IoT device, B2B partner authentication | mTLS |
| SQL injection / XSS defense | WAF (REST API only, direct) |

### Integration Type Selection Mapping

| Scenario | Integration type |
|----------|----------|
| Connect Lambda in the simplest way | AWS_PROXY (Lambda Proxy) |
| Transform the Lambda response before returning to the client | AWS (non-Proxy) + response mapping |
| Call DynamoDB/SNS/SQS directly (without Lambda) | AWS (non-Proxy) + VTL |
| Proxy an external HTTP server | HTTP_PROXY |
| External HTTP server + response transformation | HTTP + response mapping |
| Hardcoded response for dev/test | MOCK |

### Key CloudWatch Metrics Summary

| Metric | What it measures | Use |
|--------|----------|------|
| `Latency` | Client receipt ~ response returned (end-to-end) | Overall performance monitoring |
| `IntegrationLatency` | API GW → backend call ~ response | Isolate backend performance |
| `Count` | Total number of API calls | Traffic trends |
| `4XXError` | Client errors like 400/401/403/429 | Detect misuse/auth failure/throttling |
| `5XXError` | Server errors like 500/502/503/504 | Detect backend failures/timeouts |
| `CacheHitCount` | Number of times served from cache | Cache efficiency |
| `CacheMissCount` | Number of times a backend call was needed | Cache efficiency |

If `Latency - IntegrationLatency` is large, API GW internal processing (auth, VTL, cache lookup) is the bottleneck. If `IntegrationLatency` itself is large, the backend is slow.

---

## Week 4 Key Traps Checklist

1. **Without a deploy, changes don't apply**: In REST API, even if you change resources, methods, integrations, or authorizers, they aren't reflected unless you redeploy to the stage. HTTP API deploys automatically.

2. **An API key is not authentication**: The `x-api-key` header is for client identification and usage tracking. Do not mistake it for a security mechanism. An API key alone does not provide authorization.

3. **The ACM certificate for an Edge-Optimized API must be in us-east-1**: Since traffic to an Edge-Optimized endpoint flows through CloudFront, the custom domain's SSL/TLS certificate must be created in us-east-1 ACM. Regional/Private use the ACM of that region.

4. **WAF can be attached directly only to REST API**: You cannot attach a WAF Web ACL directly to HTTP API. You must use the workaround of placing CloudFront in front and attaching WAF to CloudFront.

5. **The event structure of HTTP API Payload v2.0 is different**: It has no `httpMethod`, `resource`, or `path` fields. Attaching an existing REST API Lambda as-is causes a KeyError. Set `payloadFormatVersion: "1.0"` or modify the code.

6. **You must specify the cache key for a Lambda Authorizer REQUEST type**: If you don't specify a cache key, caching doesn't work and the Authorizer Lambda is invoked on every request.

7. **A Lambda Proxy response body must be a string**: You must call `json.dumps()`; if you put a dict object directly, API Gateway can't serialize it.

8. **WebSocket $disconnect execution is not guaranteed**: On a forced network termination, `$disconnect` may not run. You must automatically clean up stale connections with a DynamoDB TTL.

9. **WebSocket Idle Timeout 10 min, Max Duration 2 hours**: Exceeding these limits forcibly terminates the connection. Clients can prevent the idle timeout with Ping/Pong.

10. **Cache invalidation (InvalidateCache) requires an IAM permission**: If you enable `requireAuthorizationForCacheControl` on the stage, a client without the `execute-api:InvalidateCache` permission gets a 403 even when sending `Cache-Control: max-age=0`.

11. **CORS is handled by a different party depending on the integration type**: In Lambda Proxy, Lambda must return the CORS headers directly. Under AWS_PROXY, API Gateway does not automatically add CORS headers. Using a Gateway Response, you can add CORS headers even to API Gateway's own errors (including 4XX).

12. **DynamoDB direct-integration VTL must handle the DynamoDB type system**: DynamoDB responses are in `{"S": "value"}`, `{"N": "123"}` format. If you don't parse this into clean JSON in VTL, the client receives DynamoDB's internal format as-is.

---

## DVA-C02 Domain Mapping

| Domain | Related Week 4 topics | Weight |
|--------|----------------|------|
| **Domain 1: Development with AWS Services** | Lambda Proxy integration, VTL, DynamoDB direct integration | 32% |
| **Domain 2: Security** | SigV4, Lambda Authorizer, Cognito Authorizer, Resource Policy, WAF, mTLS | 26% |
| **Domain 3: Deployment** | Stages, canary deployment, SAM integration, Stage Variables | 24% |
| **Domain 4: Troubleshooting** | Latency vs IntegrationLatency, causes of 429/504/502 errors, Authorizer cache | 18% |

---

## 📝 시나리오 연습 문제 (10문제)

**문제 1.**  
A startup provides an API to external partners. Partner A must be limited to 100,000 calls per month and Partner B to 500,000 per month. Also, Partner B needs a rate limit of 100 requests/second and Partner A 20 requests/second. What is the most appropriate configuration?

A) Create a separate REST API and stage per partner and set rate/burst throttling on each stage — differentiated rates work, but it can't provide a monthly quota, and the API is duplicated per partner, driving up operational complexity  
B) Create a Usage Plan per partner and issue an API key to each partner, linking it to the appropriate plan  
C) Verify the partner ID in a Lambda Authorizer and atomically record the call count in a DynamoDB counter to implement monthly/per-second limits yourself — it works but the atomicity of a distributed counter is costly and reinvents a managed feature  
D) Limit the request count per partner IP with an `aws:SourceIp` condition in an API Gateway resource policy — a resource policy is only allow/deny access control and has no rate limit/quota functionality  

**정답: B**  
Usage Plans are a feature designed to apply throttling (rateLimit/burstLimit) and quota at the API-Key level. By creating a separate plan for Partner A and B and linking each partner's API Key to the appropriate plan, you can apply differentiated limits with a single REST API and stage. A's multiple stages add unnecessary complexity, and C has high self-implementation cost plus atomicity problems. D's resource policy is for IP-based access control and has no request-count limiting.

---

**문제 2.**  
A company's REST API Lambda function depends on an external payment service. In CloudWatch, `5XXError` is increasing, `Latency` is close to 29 seconds, and `IntegrationLatency` is also close to 29 seconds. What is the most likely cause?

A) The Lambda Authorizer is slow, so time is being spent in the auth stage — but then Latency should be larger than IntegrationLatency, whereas here the two are nearly equal, so the bottleneck is the backend  
B) The Lambda function is hitting the API Gateway integration timeout (29 seconds) before responding  
C) The client is exceeding limits and 429 throttling is occurring — if it were throttling, 4XXError would increase, not 5XX, and Latency wouldn't pin to 29 seconds  
D) A CloudWatch Logs misconfiguration is inflating the recorded Latency/IntegrationLatency metrics above their real values — a pattern where both metrics consistently converge on 29 seconds is a classic signal of a real backend timeout  

**정답: B**  
`Latency ≈ IntegrationLatency ≈ 29 seconds` indicates that the backend (Lambda) is delaying its response and hitting the API Gateway integration timeout (max 29 seconds), returning a 504 Gateway Timeout. A large `IntegrationLatency` means the backend is the bottleneck. Since there's a dependency on an external payment service, the payment service's response delay is likely blocking the Lambda. Solution: set a separate timeout on the payment service call in Lambda, and adopt an async processing pattern (Lambda → SQS → payment-processing Lambda).

---

**문제 3.**  
A dev team implemented a DynamoDB direct integration (VTL) on a REST API. API Gateway calls DynamoDB `GetItem` and returns the response to the client. The client developer complained that the response comes in the format `{"Item": {"name": {"S": "Hong Gildong"}, "age": {"N": "30"}}}`. How do you fix this?

A) Add a Lambda function behind the integration to parse the DynamoDB response and return clean JSON — it works, but it throws away the core benefit of the Lambda-free direct integration (eliminating cost and cold starts)  
B) Force all attribute types of the DynamoDB table to string (S) to remove the type wrappers from the response — DynamoDB always includes a per-item type wrapper, so it can't be removed via table configuration  
C) Write a VTL mapping template in the Integration Response to transform the DynamoDB response into clean JSON  
D) Migrating the REST API to HTTP API automatically strips the type wrappers in DynamoDB direct integration — HTTP API doesn't support VTL or direct AWS service integration, so this scenario itself is impossible  

**정답: C**  
DynamoDB responds in a format that includes its type system (`"S"`, `"N"`, `"BOOL"`, etc.). In the Integration Response VTL mapping template, you can extract each field with something like `$input.path('$.Item.name.S')` to generate clean JSON. A throws away the advantage of the Lambda-free direct integration. D is wrong because HTTP API doesn't support VTL mapping — DynamoDB direct integration is itself impossible on HTTP API.

---

**문제 4.**  
A mobile app queries data through an API Gateway REST API. It authenticates with a Cognito User Pool. You want to reduce Lambda calls when the same user repeatedly queries the same data. You enabled response caching, but a problem arose where all users share the same cached value. What is the cause and solution?

A) Since caching doesn't automatically include the Cognito token in the cache key, add the Authorization header to the cache key  
B) API Gateway caching doesn't support per-user separation, so turn off the cache and implement per-user caching inside Lambda yourself — adding the header to the cache key achieves separation, so self-implementation is unnecessary  
C) Switching from the Cognito Authorizer to a Lambda Authorizer automatically separates the cache by principalId — the authorizer type and the response cache key are unrelated, so it won't separate automatically  
D) Switching the REST API to HTTP API applies per-token caching by default — HTTP API doesn't support response caching at all, so it can't be a solution  

**정답: A**  
The default value of an API Gateway cache key is the request path and method. If you don't include the `Authorization` header or user ID in the cache key, the first response of one user is stored in the cache and every subsequent user receives that same cached value. Adding the `Authorization` header to the cache key in the stage settings creates independent cache entries per user. Note, however, that doing so creates as many cache entries as there are unique tokens, so you must consider the cache size.

---

**문제 5.**  
You're building a real-time stock trading alert system. When a trader connects from a web browser, the server must push price changes immediately. The trader has no need to send messages to the server. What is the most suitable architecture?

A) Configure a bidirectional channel with WebSocket API + DynamoDB connection registry + Lambda broadcast — it works, but for one-way push it adds unnecessary complexity and cost in the form of a connection registry and broadcast logic  
B) Have the client poll the REST API every 5 seconds to fetch the latest price — immediacy is poor and a call occurs every time even for empty responses, which is inefficient  
C) Lambda Response Streaming + Function URL (SSE pattern)  
D) Deliver events with SNS + SQS + Lambda + REST API long polling — too many components, overly complex, and unsuitable for real-time push to a browser  

**정답: C**  
For server → client one-way streaming, the SSE pattern is simpler and cheaper than WebSocket. With Lambda Response Streaming you can incrementally deliver a response with the `text/event-stream` Content-Type. WebSocket (A) is suitable when bidirectional communication is needed and brings additional complexity such as a DynamoDB connection registry and broadcast logic. For one-way notifications only, C is simpler and cheaper.

---

**문제 6.**  
A company wants to configure WAF on a REST API to block SQL injection. However, some legitimate requests are also being blocked. The team wants to analyze the pattern of blocked requests and fine-tune the WAF rules. Which WAF setting should they enable?

A) Enable WAF Sampled Requests to view a sample of matched requests in the console — it shows only some samples and helps analysis, but it doesn't stop blocking, so legitimate requests keep getting blocked  
B) Raise API Gateway Execution Logs to INFO level to log blocked requests in detail — execution logs are only the API GW processing history and don't show the cause of a WAF rule match  
C) Enable X-Ray tracing to analyze per-request-path latency and the blocking point — X-Ray is a performance tracing tool and doesn't provide data usable for WAF rule tuning  
D) Switch the WAF Web ACL to count mode and enable CloudWatch Logs  

**정답: D**  
WAF's count mode doesn't actually block on a rule; it only records matches. This lets you analyze false positives (blocking of legitimate requests) without actual blocking. Configuring WAF logging to Kinesis Firehose or CloudWatch Logs lets you see detailed information about blocked/counted requests (IP, request URI, matched rule, etc.). After the rules stabilize, switching to block mode is the standard approach for WAF rule deployment.

---

**문제 7.**  
A startup wants to deploy a Next.js backend API to AWS. Each API path is split into a separate Lambda, and the requirements are: (1) low cost, (2) Cognito-based JWT authentication, (3) automatic CORS setup, (4) a custom domain. Which API type is most suitable?

A) REST API (Cognito User Pool Authorizer + manual CORS + us-east-1 ACM custom domain) — it meets the requirements but per-call cost is about 3.5x higher and CORS must be configured manually, which is unfavorable for the cost and automation requirements  
B) HTTP API (JWT Authorizer + automatic CORS setup + custom domain)  
C) Function URL (automatic CORS + IAM auth) to expose each Lambda directly — only one URL per function is possible, so it can't provide multi-path routing or a unified custom domain  
D) Handle requests by maintaining a persistent connection with the client via WebSocket API — a bidirectional protocol unsuitable for a request-response REST backend, and it doesn't support JWT Authorizer or automatic CORS  

**정답: B**  
HTTP API satisfies all four requirements: (1) about 70% cheaper than REST API, (2) native Cognito JWT validation via the JWT Authorizer, (3) automatic CORS setup support, (4) custom domain support. Function URL can only expose a single function, can't route multiple API paths, and has limited custom domain support.

---

**문제 8.**  
There's an API using a Lambda Authorizer (TOKEN type, TTL 300 seconds). The security team requests that a specific user's JWT token be invalidated immediately. The token has not yet expired. What is the fastest way?

A) Disable that user's account in Cognito to invalidate the token — it blocks issuing new tokens, but the already-cached Authorizer Allow policy remains valid for the TTL duration, so it's not blocked immediately  
B) Add that token to a blacklist in the Lambda Authorizer function code, and temporarily change the Authorizer TTL to 0  
C) Wait until the Authorizer cache TTL of 300 seconds expires and let it be invalidated naturally — this doesn't meet the immediate-invalidation requirement and access is allowed in the meantime  
D) Redeploy the API Gateway stage to forcibly clear the Authorizer cache — redeploying doesn't clear the Authorizer result cache, so the cached token keeps passing  

**정답: B**  
A Lambda Authorizer's TTL cache stores the response for a token it previously judged valid. Even if you add the token to a blacklist, if the 300-second TTL remains, the cached Allow policy keeps being used. To invalidate immediately, set the Authorizer TTL to 0 to disable caching and modify the code to check the internal Lambda blacklist. Leaving the TTL at 0 permanently invokes Lambda on every request, so after handling the invalidation you should restore the TTL.

---

**문제 9.**  
In a WebSocket API-based real-time chat, you must broadcast a message only to users in a specific chat room. There's a connection registry in DynamoDB. What is the most efficient DynamoDB lookup method?

A) Read the entire table with Scan + FilterExpression and then filter to only that chat room's connections — Scan reads all items, so RCU and latency grow linearly with the number of connections, making it inefficient  
B) Set the chat room ID as a GSI Partition Key and use Query to look up only that chat room's connections  
C) Create a separate DynamoDB table per chat room and store connections separately — the number of tables grows with the number of chat rooms, imposing management/limit burdens and being unsuitable for dynamic chat room creation  
D) Keep a chat-room-to-connection mapping in ElastiCache Redis and look it up — it's fast, but it requires additional infrastructure/cost/operations in the form of an ElastiCache cluster, which is excessive for this requirement  

**정답: B**  
Using a GSI (Global Secondary Index) lets you Query with the chat room ID as the Partition Key, enabling an O(k) Query (k = the number of connections in that chat room) instead of an O(n) Scan. Scan (A) reads the entire table, so cost and time grow linearly. The larger the number of connections, the bigger the performance gap between Scan and GSI Query. D is also valid but requires the additional infrastructure (ElastiCache) cost and management.

---

**문제 10.**  
A team uses API Gateway HTTP API with Lambda integration. The existing Lambda code was code that worked on REST API, reading the client IP with `event["requestContext"]["identity"]["sourceIp"]`. After switching to HTTP API, an error occurs in that code. What is the root cause and solution?

A) HTTP API doesn't provide the client IP as an event, so you must keep the REST API — HTTP API does provide the IP; only its location changed, so there's no reason to abandon the switch  
B) In HTTP API Payload v2.0, the IP is at `event["requestContext"]["http"]["sourceIp"]`. Modify the code or set payloadFormatVersion to "1.0"  
C) The Lambda execution role is missing `execute-api`-related permissions, so access to the IP field is being denied — IAM permissions are unrelated to the availability of event payload fields, so this isn't the cause  
D) You must parse the `X-Forwarded-For` header directly instead of sourceIp and extract the first IP — it's possible, but v2.0 provides sourceIp, so header parsing is an unnecessary workaround  

**정답: B**  
HTTP API uses Payload Format Version 2.0 by default. In v2.0 the request context structure changed: `requestContext.identity` is gone, and the client IP moved to `requestContext.http.sourceIp`. There are two solutions: specify `payloadFormatVersion: "1.0"` in the Lambda integration settings to receive v1.0 (REST API-compatible) events, or modify the Lambda code to match the v2.0 structure.

---

## Week 4 Self-Assessment

| Question type | Included questions | If you need to relearn |
|----------|----------|---------------|
| Authentication method selection | 1, 8 | Day 18 |
| Integration types & VTL | 3 | Day 17 |
| Caching & throttling | 4, 1 | Day 18 |
| Real-time communication design | 5, 9 | Day 19 |
| API type selection | 7 | Day 16, 19 |
| Troubleshooting (metrics) | 2 | Day 18 |
| WAF & security | 6 | Day 18 |
| Payload Format | 10 | Day 19 |

| Score | Assessment |
|------|------|
| 9-10 | Complete understanding of API Gateway. Proceed to Week 5 |
| 7-8 | Excellent. Recheck the Day file for the questions you missed |
| 5-6 | Good. Re-familiarize with the Week 4 Day 16-19 traps checklist |
| 3-4 | Fair. Relearning all of Day 16-19 is recommended |
| 0-2 | You need to relearn Week 4 from the beginning |
