# Day 1 - API Gateway REST API: The Full Path a Request Takes to Reach the Backend

When Amazon API Gateway first appeared in 2015, the ways to build a serverless API were to run Flask or Express on EC2, or to use Elastic Beanstalk. API Gateway started out in the role of "a managed service that exposes a Lambda function as an HTTP endpoint", but over time it grew into a complete API management platform with authentication, caching, traffic control, and monitoring bolted on.

Today we dissect the internal structure of the REST API completely. From the moment a client sends an HTTP request, through the invocation of Lambda, to the response coming back — once you understand what every layer along that path does, 70% of the exam questions solve themselves.

## Why You Need API Gateway: A Comparison with Lambda Function URL

Since 2022, Lambda has had Function URLs. You can attach an HTTPS endpoint directly to a Lambda function without API Gateway. So why use API Gateway at all?

| Feature | Function URL | API Gateway HTTP API | API Gateway REST API |
|------|-------------|---------------------|---------------------|
| Cost | Free (Lambda charges only) | $1/million calls | $3.5/million calls |
| Routing | Single function | Different function per path | Different function per path |
| Auth | NONE / AWS_IAM | JWT / Lambda / IAM | Lambda / Cognito / IAM |
| Caching | ❌ | ❌ | ✅ |
| API keys & usage plans | ❌ | ❌ | ✅ |
| Request validation | ❌ | ❌ | ✅ (JSON Schema based) |
| WAF integration | ❌ | ❌ | ✅ |
| VTL transformation | ❌ | ❌ | ✅ |
| X-Ray | ❌ | ❌ | ✅ |
| Response Streaming | ✅ | ❌ | ❌ |
| WebSocket | ❌ | ❌ | Separate WebSocket API |

**Selection criteria**: Single Lambda + simple HTTP exposure → Function URL. Complex routing, auth, caching, and usage limits needed → REST API. Cost-sensitive, simple Lambda/HTTP proxy → HTTP API.

> 💡 **Related theory**: API Gateway is a combination of the **Message Router** + **Message Filter** from Enterprise Integration Patterns (EIP, Gregor Hohpe 2003) and the **API Gateway Pattern** (Sam Newman, "Building Microservices" 2015). In a microservices architecture, the API Gateway pattern lets external clients reach dozens of services through a single entry point without needing to know each one directly. Netflix's Zuul, Kong, Nginx Plus, and AWS API Gateway are all implementations of this pattern.

## The Layered Structure of a REST API: Resource, Method, Integration, Stage

A REST API is a tree structure.

```
API (MyShopAPI)
  └── Resource /products
        ├── GET  → Integration (Lambda: ListProducts)
        │           ├── Integration Request (request transformation)
        │           └── Integration Response (response transformation)
        ├── POST → Integration (Lambda: CreateProduct)
        └── /products/{productId}
              ├── GET    → Integration (Lambda: GetProduct)
              ├── PUT    → Integration (Lambda: UpdateProduct)
              └── DELETE → Integration (Lambda: DeleteProduct)
```

**Resource**: The URL path. Path parameters are declared with `{}` curly braces.
**Method**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.
**Integration**: The backend a method calls. Lambda, HTTP, AWS service, Mock.
**Stage**: A deployment environment. dev, staging, prod.
**Deployment**: A snapshot of API changes. It must be attached to a stage to take effect.

> ⚠️ **Trap**: After changing an API, you **must create a deployment and attach it to a stage** for the change to apply. If you only hit "Save" in the console and skip the deployment, clients still see the previous version of the API.

## The Path a Request Travels: A Complete 6-Stage Breakdown

```
Client request (HTTPS)
        │
        ▼
[1. Endpoint receipt]
   Edge-Optimized: TLS termination at a CloudFront PoP
   Regional: directly to the regional API Gateway
   Private: via a VPC Interface Endpoint
        │
        ▼
[2. Method Request]
   - Authentication (IAM SigV4, Lambda Authorizer, Cognito)
   - Validation of path parameters, headers, query string
   - Request model (JSON Schema) validation
   On failure → immediately returns 400/401/403
        │
        ▼
[3. Integration Request]
   - Transform the request with a VTL mapping template
   - Call the Lambda / HTTP endpoint / AWS service
        │
        ▼
[4. Backend processing]
   - Lambda execution
   - HTTP endpoint response
   - DynamoDB response, etc.
        │
        ▼
[5. Integration Response]
   - Backend response → transformed with a VTL mapping template
   - With Lambda Proxy, passed through as-is with no transformation
        │
        ▼
[6. Method Response]
   - Sets the HTTP status code, headers, and response model
   - Delivers the final response to the client
```

Once you understand these six stages, API Gateway troubleshooting becomes easy.
- A 401/403 → check the auth layer in [2]
- A 400 → request validation failure in [2] (parameter / model)
- 502 Bad Gateway → backend error in [4] (Lambda error or format problem)
- 504 Timeout → backend timeout in [4] (Lambda 30-second limit exceeded)

## The Three Endpoint Types and How to Choose

**Edge-Optimized**: Terminates TLS at CloudFront's 600+ PoPs and forwards the request over the backbone network. Suitable for public APIs with many global users. Note that this is an AWS-managed CloudFront that doesn't appear in your actual CloudFront console. If you need custom CloudFront configuration, use Regional + a separate CloudFront.

**Regional**: Clients in the same region connect directly. Advantageous when calling an API in the same region from EC2 or Lambda. You can attach your own CloudFront to add caching and WAF.

**Private**: Accessible only through an Interface Endpoint (PrivateLink) inside a VPC. Absolutely unreachable from the internet. Suitable for internal microservice APIs and data pipeline APIs.

| Endpoint | CloudFront | Custom domain ACM location | Use case |
|-----------|-----------|---------------------|----------|
| Edge-Optimized | AWS-managed | **us-east-1 required** | Global public API |
| Regional | Optional (your own) | Each region | In-region services, mobile backends |
| Private | None | Each region | Internal VPC APIs |

> ⚠️ **Trap**: The ACM certificate for an Edge-Optimized custom domain **must be issued in us-east-1**. This is because CloudFront only references ACM in us-east-1. In a "my domain doesn't work" scenario, a common cause is a certificate issued in a region other than us-east-1. Regional endpoints may use certificates issued in each region's own ACM.

## Stages and Stage Variables: Per-Environment Routing

A stage is more than just distinguishing "dev/staging/prod". Through **stage variables**, the same API definition can route to different backends.

```
API integration URI:
arn:aws:lambda:ap-northeast-2:123:function:OrderAPI:${stageVariables.lambdaAlias}

dev stage:   lambdaAlias = dev  → OrderAPI:dev  (alias)
prod stage:  lambdaAlias = prod → OrderAPI:prod (alias)
```

Stage variable usage patterns:
- Lambda alias branching (most common)
- HTTP integration URL branching (`${stageVariables.backendUrl}`)
- AWS service ARN branching

```bash
# Set stage variables
aws apigateway create-stage \
  --rest-api-id abc123 \
  --stage-name prod \
  --variables 'lambdaAlias=prod,backendUrl=https://api.mycompany.com'
```

> 🔍 **Going deeper**: Stage variables are environment variables at the API Gateway level. They are a different layer from a Lambda function's environment variables. Lambda environment variables are exposed to your code at function execution time, while stage variables are substituted when API Gateway constructs the integration URI. Use both together and you get a structure where API Gateway → Lambda integration calls a different function per stage, and each function internally manages additional configuration via its own environment variables.

## REST API vs HTTP API vs WebSocket API: The Core Comparison Table

| Item | REST API | HTTP API | WebSocket API |
|------|----------|----------|---------------|
| Cost | $3.5/million | **$1/million** | $1/million messages + connection time |
| Latency | Moderate | Low | - |
| Communication direction | Request-response | Request-response | Bidirectional |
| Lambda Proxy | ✅ | ✅ | Per route |
| Lambda Authorizer | ✅ | ✅ | ✅ |
| JWT Authorizer | Via Lambda | **✅ Native** | ❌ |
| Cognito Authorizer | ✅ | Use JWT instead | ❌ |
| IAM (SigV4) | ✅ | ✅ | ✅ |
| API keys & usage plans | ✅ | ❌ | ❌ |
| Response caching | ✅ | ❌ | - |
| Request validation (models) | ✅ | ❌ | ❌ |
| VTL mapping templates | ✅ | ❌ | ❌ |
| Direct AWS service integration | ✅ | ❌ | ❌ |
| WAF integration | ✅ | CloudFront required | ❌ |
| X-Ray tracing | ✅ | ❌ | ❌ |
| Edge-Optimized | ✅ | ❌ | ❌ |
| VPC Link (ALB) | NLB only | ALB/NLB/Cloud Map | ❌ |
| Automatic CORS setup | Manual | ✅ | - |

**Exam scenario keyword → choice:**
- "Tiered limits per partner with API keys and usage plans" → **REST API**
- "Minimize cost, simple Lambda proxy" → **HTTP API**
- "Defend against SQL injection with WAF" → **REST API**
- "Automatic JWT validation (Cognito/Auth0/Okta)" → **HTTP API** (built-in JWT Authorizer)
- "Real-time chat, gaming, collaboration tools" → **WebSocket API**
- "X-Ray distributed tracing" → **REST API**

## Custom Domains: Setting Up api.mycompany.com

```
Route 53 A record (Alias)
api.mycompany.com → API Gateway Custom Domain
        │
        ▼
API Gateway Custom Domain Name
  + ACM certificate (HTTPS TLS)
        │
        ▼ Base Path Mapping
/v1 → REST API "MyAPI" stage "prod"
/v2 → REST API "MyAPI-v2" stage "prod"
/internal → REST API "InternalAPI" stage "prod"
```

```bash
# Create a custom domain (Regional endpoint)
aws apigateway create-domain-name \
  --domain-name api.mycompany.com \
  --endpoint-configuration types=REGIONAL \
  --regional-certificate-arn arn:aws:acm:ap-northeast-2:123:certificate/abc

# Base Path Mapping (route multiple APIs through one domain)
aws apigateway create-base-path-mapping \
  --domain-name api.mycompany.com \
  --rest-api-id abc123 \
  --stage prod \
  --base-path v1
```

## REST API Built-in Canary Deployment

Separately from the canary on a Lambda alias, you can enable a canary on the REST API stage itself.

```bash
# Configure a canary on the stage (only 10% of traffic to the new deployment)
aws apigateway update-stage \
  --rest-api-id abc123 \
  --stage-name prod \
  --patch-operations \
    'op=replace,path=/canarySettings/percentTraffic,value=10' \
    'op=replace,path=/canarySettings/deploymentId,value=new-deploy-id'

# Promote the canary (to 100%)
aws apigateway update-stage \
  --rest-api-id abc123 \
  --stage-name prod \
  --patch-operations 'op=replace,path=/canarySettings/percentTraffic,value=0'
```

> 💡 **Related theory**: When you use API Gateway's canary deployment together with traffic splitting on a Lambda alias, you get two layers of safety. Combining an API Gateway canary (at the deployment-version level) with a Lambda alias canary (at the function-version level) minimizes deployment risk. This is in line with Netflix's "Chaos Engineering" principle — verify a system's robustness through controlled risk.

## OpenAPI (Swagger) Import/Export

When managing API definitions as code or sharing them across teams, use the OpenAPI 3.0 format.

```yaml
# openapi.yaml
openapi: "3.0.1"
info:
  title: "ProductAPI"
  version: "1.0"

paths:
  /products:
    get:
      summary: "List products"
      x-amazon-apigateway-integration:
        type: aws_proxy
        httpMethod: POST
        uri: "arn:aws:apigateway:ap-northeast-2:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-2:123:function:ListProducts/invocations"
        payloadFormatVersion: "1.0"
      responses:
        "200":
          description: "Success"
```

```bash
# Import an API from an OpenAPI definition
aws apigateway import-rest-api \
  --body file://openapi.yaml \
  --region ap-northeast-2

# Update an existing API (merge mode)
aws apigateway put-rest-api \
  --rest-api-id abc123 \
  --mode merge \
  --body file://openapi.yaml
```

## The Pricing Model

| API type | First 300M calls | Beyond |
|----------|------------|------|
| REST API | $3.50/million | $1.51/million |
| HTTP API | $1.00/million | $0.90/million |
| WebSocket | $1.00/million messages + $0.25/million connection-minutes | - |
| Caching | 0.5GB: $0.020/h ~ 237GB: $3.800/h | - |

Data transfer: the first 10TB/month is $0.09/GB, with tiered discounts after that.

> 📚 **Case study**: In 2019, Slack adopted API Gateway HTTP API (in its early release) and dramatically cut the cost of receiving webhooks. On short webhook requests running thousands per second, a 70% reduction versus REST API was verified. However, those internal Slack APIs that need usage tracking still use REST API — because API keys and usage plans are not available on HTTP API.

## Wrapping Up

An API Gateway REST API is a 6-stage pipeline that receives an HTTP request, authenticates it, validates it, transforms it, calls the backend, and transforms the response on the way back. The endpoint type determines the traffic path, the stage is the per-environment deployment unit, and stage variables are the mechanism for flexibly connecting a single API definition to multiple environments. The three API types — REST, HTTP, WebSocket — have clear trade-offs in features and cost, and you simply choose based on your requirements.

In the next article, we dig into the heart of API Gateway integrations: Lambda Proxy integration, VTL mapping templates, and direct AWS service integration.

---

## 📝 연습 문제

**문제 1.** You created a stage on an API Gateway REST API, but your changes are not reflected to clients. What is the cause?

A) You need to clear the cache  
B) You need to redeploy the Lambda function  
C) After changing the API, you must create a new Deployment and attach it to the stage  
D) You need to invalidate the CloudFront cache  

**정답: C**  
해설: After changing an API definition in API Gateway (resources, methods, integrations, authorizers, etc.), you must create a Deployment and attach it to the stage for the change to apply. Even if you hit "Save" in the console, the existing API is served if you don't deploy. A is not a cache problem. B is not a situation that requires redeploying Lambda. D — the CloudFront cache is a separate setting and is not the cause here.

---

**문제 2.** When setting up a custom domain on an Edge-Optimized API Gateway, where must the ACM certificate be issued?

A) The region in use (e.g., ap-northeast-2)  
B) Must be us-east-1  
C) The same region as Route 53  
D) It can be issued in any region  

**정답: B**  
해설: An Edge-Optimized endpoint uses CloudFront, and CloudFront can only reference ACM certificates in us-east-1. Therefore, the ACM certificate needed for an Edge-Optimized custom domain must be issued in us-east-1. A Regional endpoint uses a certificate issued in each region's own ACM. This is a common cause of the "domain doesn't work" scenario on the DVA exam.

---

**문제 3.** You provide an API to partner companies and need to set a different call limit for each partner. Which API Gateway feature should you use?

A) Lambda Authorizer  
B) VPC Endpoint  
C) API keys + Usage Plans  
D) Cognito User Pool  

**정답: C**  
해설: An API key identifies a client (partner), and a usage plan sets requests-per-second (RPS), burst, and monthly quota limits for that key. You can apply tiered limits by allocating 1,000 RPS to Partner A and 100 RPS to Partner B, for example. A is for authentication, not usage limiting. B is for internal VPC access. D is for user authentication, not usage limiting.

---

**문제 4.** Which API type lets you integrate WAF (Web Application Firewall) directly with API Gateway?

A) HTTP API only  
B) WebSocket API only  
C) REST API (Edge-Optimized or Regional)  
D) All API types support WAF  

**정답: C**  
해설: AWS WAF can be connected directly to an API Gateway REST API (both Edge-Optimized and Regional). HTTP API does not support WAF directly; to apply WAF, you must place CloudFront in front and attach WAF to CloudFront. WebSocket API also does not support direct WAF integration.

---

**문제 5.** Which of the following is NOT an appropriate use case for an API Gateway stage variable?

A) Calling Lambda alias "dev" on the dev stage and "prod" on the prod stage  
B) Referencing a different HTTP backend URL per stage  
C) Setting a different memory size for a Lambda function per stage  
D) Specifying a different table name per stage in an AWS service integration  

**정답: C**  
해설: Stage variables are used in API Gateway to dynamically reference integration URIs, HTTP URLs, ARNs, and so on. A Lambda function's memory size is a setting of the Lambda function itself and cannot be controlled by an API Gateway stage variable. A, B, and D are all appropriate use cases for stage variables.

---

**문제 6.** A team is evaluating migrating from REST API to HTTP API. Which functional requirement makes migration impossible?

A) Lambda proxy integration  
B) IAM authentication (SigV4)  
C) CloudWatch metrics monitoring  
D) Response caching and usage plans  

**정답: D**  
해설: Response caching and usage plans are not supported on HTTP API. HTTP API is cheaper and faster, but if you need these two features you must stay on REST API. A — HTTP API also supports Lambda proxy integration. B — HTTP API also supports IAM authentication. C — HTTP API also supports CloudWatch metrics (though it has fewer detailed metric types).

---

**문제 7.** Among API Gateway REST API endpoint types, which is accessible only from inside a VPC?

A) Edge-Optimized  
B) Regional  
C) Private  
D) Internal  

**정답: C**  
해설: A Private endpoint is accessible only through an Interface Endpoint (PrivateLink) inside a VPC and can never be reached from the internet. It is suitable for internal microservice APIs, data pipeline APIs, and internal company tool APIs. You can control access from a specific VPC or VPC Endpoint more granularly with a resource policy. D is not a real endpoint type.
