# Day 2 - API Gateway: The Broker Between Client and Backend

Think about what happens when you expose an API directly on the internet. Anyone can call it without authentication, a malicious client can send thousands of requests per second, and clients from different teams demand different versions of the API. API Gateway handles all of these cross-cutting concerns outside your backend code. Authentication, throttling, caching, versioning, monitoring — instead of implementing each of these directly in every Lambda or server, you configure them declaratively at the API Gateway layer.

Behind the birth of API Gateway was the rapid spread of microservice architecture. When you decompose a single monolithic application into dozens of services, the client has to know each service's endpoint individually, and each service has to implement its own authentication. API Gateway consolidates this distributed complexity into a single entry point.

## The Three API Types — When to Choose What

AWS API Gateway offers three different API types. These three aren't merely a difference in feature levels — they differ in design philosophy and internal architecture.

### REST API

REST API is the original API Gateway (launched in 2015). You build a RESTful interface by combining HTTP methods (GET/POST/PUT/DELETE/PATCH) with resource paths. It offers the most features but is also the most expensive. It's a good fit for complex enterprise scenarios or partner API portals.

Features available only on REST API:
- **API Key + Usage Plan**: Issue keys to partners and set request-count/throughput limits
- **Response caching**: Cache responses at the API level (0.5GB–237GB)
- **Request/response transformation (Mapping Templates)**: Transform request/response formats with VTL (Velocity Template Language)
- **Direct AWS service integration**: Call DynamoDB, Kinesis, SQS, etc. directly without Lambda
- **Private Endpoint**: VPC-internal-only API via an Interface Endpoint
- **Client certificate mutual TLS**: mutual TLS (mTLS) support

### HTTP API

HTTP API launched in 2020. It's simpler, faster, and 70% cheaper than REST API. It covers the bulk of microservice APIs and Lambda integrations. If you're building a new API, consider HTTP API as the default and only reach for REST API when you need a special feature.

Features available only on HTTP API:
- **JWT Authorizer**: Integrate with OIDC Providers other than Cognito (Auth0, Okta, Firebase, in-house SSO, etc.)

Features not available on HTTP API:
- API Key + Usage Plan (REST only)
- Response caching (REST only)
- Request/response transformation (REST only)
- Direct AWS service integration (REST only)
- mTLS (REST only)

### WebSocket API

A persistent, bidirectional connection API that uses the WebSocket protocol rather than HTTP. Client and server exchange messages with each other in real time. It's a good fit for chat, notifications, real-time gaming, and financial price updates.

How WebSocket API works:
- When a client opens a WebSocket connection, the `$connect` route runs (a connection ID is assigned)
- When a client sends a message, the `$default` or a custom route runs
- When a client closes the connection, the `$disconnect` route runs
- To send a message from the server directly to a client, use the API GW callback URL: `POST /@connections/{connectionId}`
- Connection IDs are stored in DynamoDB and used to deliver messages to specific users

```
REST API:     Client → request → API GW → Lambda → response → Client
              (a new HTTP connection per request-response cycle)

HTTP API:     Cheaper than REST (70%), simpler, JWT support. Same request-response cycle

WebSocket:    Client ←──────── persistent connection (connectionId) ──────────► API GW
                        ← server→client message (Push, uses callback URL)
                        → client→server message (route-based)
```

| Aspect | REST API | HTTP API | WebSocket API |
|--------|----------|----------|---------------|
| Cost | Most expensive | ~30% of REST | Connection time + message count |
| Feature richness | Most | Simple, core only | Bidirectional real-time |
| API Key + Usage Plan | O | X | X |
| Response caching | O | X | X |
| JWT Authorizer | Cognito only (rest via Lambda) | O (all OIDC) | X |
| Request/response transformation | O (VTL) | X | X |
| Direct AWS service integration | O | X | X |
| VPC Link support | NLB only | NLB/ALB | X |
| mTLS | O | O | X |

> 💡 **API Gateway pattern theory: the Gateway pattern and the Facade pattern** — API Gateway's role matches the "Gateway" or "Facade" pattern in software architecture. Among the Gang of Four (GoF) design patterns, Facade provides a simplified interface in front of a complex subsystem. API Gateway consolidates multiple microservices (Lambda, ECS services, EC2 apps) into a single entry point and handles the cross-cutting concerns of authentication/throttling/monitoring centrally. In the microservice patterns defined by Chris Richardson, API Gateway is also an implementation of the "Backend for Frontend (BFF)" pattern — you can separate distinct BFFs for the mobile app, the web, and partners at the API Gateway level.

> 🔍 **The performance difference between HTTP API and REST API** — HTTP API is faster than REST API because its internal processing path (the pipeline) is simpler. REST API has extra processing stages to support Mapping Template processing, complex request transformation, direct AWS service integration, and so on. HTTP API removed these features and in exchange shaved tens of milliseconds off latency. Typically REST API's P50 response latency is 5–10ms, while HTTP API is in the 1–3ms range. At large traffic volumes this difference compounds into cumulative cost savings and a response-speed gap.

## Authentication and Authorization — 4 Mechanisms

API Gateway provides several authentication mechanisms so that backend code doesn't have to handle authentication directly.

**IAM authentication (SigV4)**: Authentication between AWS services, or for internal clients that use the AWS SDK. The request includes an AWS Signature Version 4 signature. It's the strongest, but it's complex to implement in ordinary web/mobile clients. A good fit for service-to-service communication (e.g., Lambda → API GW) and internal operational tools.

**Cognito User Pool**: Authentication with a JWT token issued by AWS Cognito. When a user logs in to Cognito, they receive an ID token/Access token/Refresh token, and they include the token in the Authorization header on API requests. API Gateway validates the token against Cognito. This is the standard pattern for mobile/web apps.

**Lambda Authorizer**: Fully custom authentication logic. API Gateway runs an Authorizer Lambda first for every request, and when the Lambda returns an IAM Policy, the request is allowed/denied according to that Policy. Used for integrating with your own SSO system, external OAuth services, or legacy authentication systems.

Two types:
- **Token-based**: Validates the JWT/OAuth token in the Authorization header (results can be cached)
- **Request-based**: Can use all of the HTTP request's headers, query parameters, stage variables, and context

**API Key + Usage Plan (REST API only)**: Issue API keys and set per-second/monthly request limits for each key. Used in partner APIs or developer portals. Its purpose is **usage control and billing**, rather than security authentication.

**JWT Authorizer (HTTP API only)**: Supports OIDC Providers other than Cognito. Automatically validates tokens from Auth0, Okta, Firebase, etc. at the API Gateway level. Set up JWT validation declaratively, without a Lambda Authorizer.

| Auth method | Applicable to | Purpose | Complexity |
|---------|---------|------|------|
| IAM SigV4 | REST/HTTP | Internal service-to-service comms | High (SDK required) |
| Cognito User Pool | REST | Web/mobile user authentication | Medium |
| Lambda Authorizer | REST/HTTP | Custom/legacy authentication | High (write code) |
| API Key + Usage Plan | REST only | Usage control, partner management | Low |
| JWT Authorizer | HTTP only | External OIDC authentication | Low (declarative) |

> ⚠️ **An API Key is not a security authentication mechanism** — "An API Key is a security authentication mechanism" — half right, half wrong. An API Key is largely for identifying the requester and limiting usage. AWS documentation, too, defines an API Key as a Usage Management mechanism, not Authentication. An API Key alone doesn't provide complete security — it must always be used with HTTPS transport, and it's recommended to pair it with additional authentication (Cognito or Lambda Authorizer). On the exam, when "you need to authenticate who called the API," choose Cognito/Lambda Authorizer; when it's "limit the monthly call count," choose a Usage Plan.

> 💡 **Lambda Authorizer caching and performance** — Because a Lambda Authorizer runs for every request, it adds latency and cost. To mitigate this, you can cache the Lambda Authorizer result. If you set a cache TTL, requests that arrive with the same token won't invoke the Authorizer Lambda again during the TTL period. The cache key is the token value or the request parameters. Security caveat: if you set the TTL too long, access may be allowed during the cache window even after a token is revoked. For sensitive resources, a short TTL (30–60 seconds) is recommended.

## Stages and Deployment — Environment Management

In API Gateway, the unit of deployment is the "Stage." You can manage multiple environments like dev, staging, and prod within the same API. Each stage has its own independent URL.

```
https://abc123.execute-api.ap-northeast-2.amazonaws.com/dev/orders
https://abc123.execute-api.ap-northeast-2.amazonaws.com/prod/orders
```

**Stage Variables**: Manage per-stage configuration values as variables. You can dynamically specify a Lambda function name, a Lambda function alias, an ARN, and so on as stage variables.

```json
// dev stage: lambdaAlias = "dev"
// prod stage: lambdaAlias = "prod"
// API integration URI:
// arn:aws:lambda:region:account:function:my-func:${stageVariables.lambdaAlias}
```

This way, a single API Gateway configuration automatically calls the Lambda dev alias in the dev environment and the Lambda prod alias in prod. In the deployment pipeline, you can switch environments just by changing the stage variable.

**Canary Release**: Apply a new deployment first to only a portion of traffic (e.g., 5–10%), not the whole thing, to verify stability. If there are no problems, Promote to the whole; if there is a problem, roll back immediately. It's a gradual version of Blue-Green deployment.

> 🔍 **The difference between Canary Release and Blue-Green** — A Canary Release is a pattern where a new version runs alongside the existing version while receiving only a portion of the traffic. The name comes from the analogy of sending a canary into the mine (production) first to detect danger. API Gateway Canary Release distributes traffic on a percentage basis within the same stage. Blue-Green deployment fully separates two independent environments (Blue = current, Green = new) and swaps them all at once via a DNS switch. In API Gateway, you can also implement Blue-Green by creating two stages separately and using Route 53 weighted routing.

## Caching — Faster Responses Without DB Load

When you enable response caching on a REST API, API Gateway holds the response for the duration of the TTL. When an identical request comes in, it responds from the cache without calling the backend. Both cost savings and performance gains are possible at once.

The cache key is Method + Path by default. You can include query parameters or headers in the cache key. For example, `GET /products?category=electronics` and `GET /products?category=books` have different cache keys.

Cases where caching is not suitable:
- When each user needs a different response (you'd need to include the user ID in the cache key, and the effect is limited)
- When real-time data is required (inventory, balance, real-time prices)
- POST/PUT/DELETE (caching is unsuitable for mutating operations)

Cache invalidation:
- Full cache flush: empty the stage cache from the console/API
- Individual request: `Cache-Control: max-age=0` header (this permission requires separate configuration)

> 🔍 **The internals of API Gateway caching** — API Gateway response caching is known to be based internally on Amazon ElastiCache. Cost is incurred according to the cache size (0.5GB–237GB), and performance varies by cache node type. The TTL defaults to 300 seconds (5 minutes) and can be set in the 0–3600 second range. Applying the cache to static API responses (product catalogs that change little, configuration data) can substantially reduce Lambda invocation counts and DynamoDB RCUs. However, if the cache size cost (billed hourly) exceeds the Lambda + DynamoDB cost savings, it's actually a net loss. It's effective only when traffic is high enough and the cache hit rate is high.

## Private API and VPC Link — Internal Service APIs

When you need an API that isn't exposed to the external internet and is used only inside the VPC, you use a Private API. It's accessible only through an Interface VPC Endpoint.

A VPC Link is a connection through which API Gateway calls a backend service inside a VPC. Without going through the internet, it calls an NLB (REST API), or an ALB or NLB (HTTP API) inside the VPC over the AWS private network, and through it reaches ECS, EC2, your own servers, and so on.

```
[REST API + VPC Link (NLB)]
Internet → API GW → VPC Link → NLB → ECS/EC2 (Private VPC)
Auth/throttling at the API GW, business logic in the private service

[HTTP API + VPC Link (ALB or NLB)]
Internet → API GW (HTTP API) → VPC Link → ALB → ECS/EC2 (Private VPC)

[Private API (VPC-internal only)]
Lambda (same VPC) → Interface Endpoint → Private API GW → Lambda
EC2 (same VPC)    → Interface Endpoint → Private API GW → ECS
```

> 📚 **Samsung SmartThings API Gateway case study** — In 2022, the Samsung Electronics SmartThings team shared their API Gateway use case at an AWS Summit. On a platform with hundreds of millions of connected IoT devices, they separated the three types by purpose: REST API for partner management (API Key + Usage Plan), HTTP API for device-cloud communication (low cost, JWT authentication), and WebSocket API for real-time status updates. They announced that this separation, which accurately leveraged the characteristics of each API type, cut overall API cost by 40%. This case demonstrates the real-world effect of the design principle "choose HTTP API by default and only reach for REST API when needed."

Comparison with other clouds:

| Aspect | AWS API Gateway | GCP Cloud Endpoints / API Gateway | Azure API Management |
|------|----------------|-----------------------------------|---------------------|
| Managed REST | O (REST API) | O | O |
| Cheaper HTTP version | O (HTTP API) | O (Cloud Endpoints) | O (Consumption tier) |
| WebSocket | O | X (by default) | O (WebSocket Policy) |
| API Key + Quota | O (REST only) | O | O |
| Caching | O (REST only) | O | O |
| VPC backend | VPC Link | O (Serverless VPC Access) | O (VNet integration) |
| Custom domain | O | O | O |
| WAF integration | O (AWS WAF) | O | O |
| Cost | Per-request billing | Per-request billing | Call count + capacity |

## Configuring API Gateway via the CLI

```bash
# Create an HTTP API (Lambda integration, CORS configuration)
aws apigatewayv2 create-api \
  --name prod-http-api \
  --protocol-type HTTP \
  --cors-configuration \
    AllowOrigins="https://myapp.com",\
    AllowMethods="GET,POST,PUT,DELETE",\
    AllowHeaders="Authorization,Content-Type",\
    MaxAge=300

# Add a Lambda integration (Payload Format 2.0)
aws apigatewayv2 create-integration \
  --api-id abc123 \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:ap-northeast-2:111:function:my-func \
  --payload-format-version 2.0

# JWT Authorizer (Cognito or external OIDC)
aws apigatewayv2 create-authorizer \
  --api-id abc123 \
  --name cognito-jwt-auth \
  --authorizer-type JWT \
  --identity-source '$request.header.Authorization' \
  --jwt-configuration \
    Audience=["client-id"],\
    Issuer=https://cognito-idp.ap-northeast-2.amazonaws.com/POOL_ID

# Create a route (apply the JWT Authorizer)
aws apigatewayv2 create-route \
  --api-id abc123 \
  --route-key "GET /orders" \
  --authorization-type JWT \
  --authorizer-id auth-id \
  --target integrations/integ-id

# Create a stage (Auto-Deploy + throttling)
aws apigatewayv2 create-stage \
  --api-id abc123 \
  --stage-name prod \
  --auto-deploy \
  --default-route-settings \
    ThrottlingBurstLimit=1000,\
    ThrottlingRateLimit=100,\
    DetailedMetricsEnabled=true

# REST API - create an API Key
aws apigateway create-api-key \
  --name "partner-acme" \
  --enabled

# REST API - create a Usage Plan (10000/month, 50/sec)
aws apigateway create-usage-plan \
  --name "partner-plan" \
  --throttle BurstLimit=100,RateLimit=50 \
  --quota Limit=10000,Period=MONTH \
  --api-stages '[{"apiId":"rest-api-id","stage":"prod"}]'

# Attach the API Key to the Usage Plan
aws apigateway create-usage-plan-key \
  --usage-plan-id plan-id \
  --key-id key-id \
  --key-type API_KEY

# REST API - configure a Canary Release (10% to the new deployment)
aws apigateway update-stage \
  --rest-api-id rest-api-id \
  --stage-name prod \
  --patch-operations \
    '[{"op":"replace","path":"/canarySettings/percentTraffic","value":"10"}]'

# Create a VPC Link (HTTP API → ALB/NLB)
aws apigatewayv2 create-vpc-link \
  --name prod-vpc-link \
  --subnet-ids subnet-private-a subnet-private-b \
  --security-group-ids sg-api-gw

# REST API - direct AWS Service integration (DynamoDB PutItem)
aws apigateway put-integration \
  --rest-api-id rest-api-id \
  --resource-id resource-id \
  --http-method POST \
  --type AWS \
  --integration-http-method POST \
  --uri arn:aws:apigateway:ap-northeast-2:dynamodb:action/PutItem \
  --credentials arn:aws:iam::111:role/api-gw-dynamo-role
```

## Wrapping Up

API Gateway's three types (REST, HTTP, WebSocket) were each built for different requirements. HTTP API is the cost-effective default choice, and you go to REST API only when you need complex transformation/caching/API Key management. WebSocket is only for when you need real-time bidirectional communication.

For authentication, Cognito JWT is the most common; when you need custom logic, use a Lambda Authorizer; for internal AWS-service-to-service, use IAM SigV4; and for an external OIDC Provider, use HTTP API + JWT Authorizer.

The trap that comes up most often on the exam: "API Key + Usage Plan can be used on HTTP API" — it can't. It only works on REST API. "Real-time chat can be implemented with REST API" — technically possible, but WebSocket is far more efficient and appropriate.

Tomorrow we cover Step Functions, which weaves multiple Lambda functions and services into a single workflow, and AppSync, the managed service for GraphQL.

---

## 📝 연습 문제

**문제 1.** You want to provide an external API to partner companies while applying a per-partner limit of 10,000 requests per month and a 50 TPS cap. What is the most suitable API Gateway configuration?

A) HTTP API + JWT Authorizer (authenticate with the partner's JWT)
B) REST API + API Key + Usage Plan
C) WebSocket API + Lambda Authorizer
D) HTTP API + Lambda Authorizer (track request counts directly)

**정답: B**

해설: API Key + Usage Plan is a feature supported only on REST API. In the Usage Plan you set the monthly quota (10,000) and the throttling (50 TPS), and you issue and attach an API Key per partner. HTTP API has no API Key + Usage Plan, so A and D can't meet this requirement. C is wrong because WebSocket is for persistent connections and doesn't fit the REST API pattern.

---

**문제 2.** A mobile app calls an API with a JWT token issued through the company's own OAuth 2.0 server (in-house SSO), not Cognito. How do you handle this authentication with the least implementation effort?

A) REST API + Lambda Authorizer (implement token-validation logic yourself)
B) HTTP API + JWT Authorizer (configure the in-house SSO as the OIDC Provider)
C) REST API + Cognito User Pool Authorizer (requires integrating with Cognito)
D) HTTP API + API Key (issue a key instead of a token)

**정답: B**

해설: HTTP API's JWT Authorizer supports not only Cognito but any OIDC-compliant Provider. If the in-house SSO server complies with OIDC, you only need to set the Issuer URL and Audience. JWT validation is possible declaratively, without any Lambda code. A is also possible but requires writing Lambda Authorizer code, so it doesn't fit "the least implementation effort." C would require replacing the in-house SSO with Cognito, a large change.

---

**문제 3.** You enabled API Gateway response caching. The cache TTL for the `/products` endpoint is 5 minutes. Inventory has changed, but clients are receiving the old cached data. What is the way to invalidate the cache immediately?

A) Update ElastiCache directly from the Lambda function
B) Flush the API Gateway cache from the console/CLI, or have the client include a Cache-Control: max-age=0 header
C) Redeploy the API Gateway stage
D) Redeploy the Lambda function

**정답: B**

해설: There are two ways to invalidate the API Gateway response cache. ① Fully flush the cache from the console or API. ② Have the client include a `Cache-Control: max-age=0` header to make a cache-bypass request (this permission must be separately allowed in API Gateway). A is wrong because you can't access the API Gateway cache directly via the ElastiCache API. C and D are wrong because deployment and cache contents are unrelated.

---

**문제 4.** You're building a financial app that must Push real-time stock prices from the server to the client. The client is a web browser, and the server must be able to send data first, without the client requesting it. What is the most suitable API Gateway type?

A) REST API (polling, where the client requests periodically)
B) HTTP API (Server-Sent Events support)
C) WebSocket API (can Push from server to client)
D) REST API + CloudFront (caching at the edge)

**정답: C**

해설: WebSocket API provides a bidirectional, persistent connection where the server can Push a message to the client first. It's the standard solution for cases where the server must Push updates, like real-time prices. The server-side Lambda sends a message to a specific client via the callback URL (`@connections/{connectionId}`). A is wrong because polling has latency and heavy server load. B is wrong because API Gateway HTTP API doesn't natively support Server-Sent Events. D is static-content caching and unrelated to real-time Push.

---

**문제 5.** On an API Gateway REST API, you want to handle a direct PUT request to DynamoDB without Lambda. The JSON format the client sends differs from the DynamoDB API format, so transformation is needed. Which feature should you use?

A) HTTP API + Lambda Proxy integration
B) REST API + AWS Service integration + Mapping Template (VTL)
C) REST API + HTTP Proxy integration
D) HTTP API + direct AWS Service integration

**정답: B**

해설: REST API's AWS Service integration can call AWS services like DynamoDB, SQS, and Kinesis directly without Lambda. Request/response transformation is handled with a VTL (Velocity Template Language) Mapping Template. Transforming the client's JSON into the DynamoDB PutItem API format is the core role of this combination. HTTP API doesn't support direct AWS Service integration or Mapping Templates, so A and D are impossible.

---

**문제 6.** The dev team wants to deploy a new version of the API while routing only 10% of existing traffic to the new version to verify stability. If there are no problems, they switch to 100%. How do you implement this?

A) Create a new stage and send 10% to the new stage with Route 53 Weighted Routing
B) Enable API Gateway Canary Release and set the canary weight to 10%
C) Set the weight of the Lambda alias to 10%
D) Route 10% to a new Origin in a CloudFront behavior

**정답: B**

해설: When you enable Canary Release on an API Gateway stage, you can directly set the traffic percentage for the new deployment. Start at 10%, increase it gradually, and if there are no problems, Promote to switch to 100%. If a problem arises, roll back immediately. A is possible but has the complexity of managing Route 53 separately. C, a Lambda alias weight, is a similar feature, but API Gateway Canary is more direct and also lets you view API-level statistics separately. D is wrong because CloudFront doesn't provide this kind of weighted routing by default.

---

**문제 7.** In a microservice architecture, internal services are implemented as ECS containers behind an NLB inside a VPC. External clients need to access these services, but internet traffic must not pass directly through the VPC-internal network. What is the most suitable configuration?

A) Assign public IPs to the ECS services to allow direct access
B) Use API Gateway + VPC Link to connect to the NLB over the private network
C) Place an ALB in a public subnet and connect it to ECS
D) Call the ECS private IPs directly with an HTTP Proxy from API Gateway

**정답: B**

해설: VPC Link is the mechanism by which API Gateway connects to an NLB inside a VPC over the AWS private network, without going through the internet. External clients access the API Gateway endpoint, and the actual traffic is delivered via the VPC Link to the NLB → ECS. The ECS containers stay in a private subnet. A is a large security risk. C, placing an ALB publicly, is possible but gives up the benefits of API Gateway such as authentication/throttling. D is wrong because API Gateway doesn't route to private IPs directly.

---
