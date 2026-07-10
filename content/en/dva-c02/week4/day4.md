# Day 4 - WebSocket API and HTTP API: The Inner Workings of Real-Time Connections and Lightweight Proxies

API Gateway's three API types (REST, HTTP, WebSocket) are not merely a matter of feature differences — they implement fundamentally different networking paradigms. REST API and HTTP API are built on the request-response model of HTTP/1.1, while WebSocket API implements the persistent bidirectional connection of RFC 6455 (the WebSocket Protocol). Which API type you choose is an architectural design decision, and choosing wrong means either 70% wasted cost or real-time features that are fundamentally impossible. In this file we dissect the WebSocket API's connection lifecycle and how HTTP API differs from REST API at the level of internal behavior.

---

## The Principle of the WebSocket Protocol: Why It's Fundamentally Different from HTTP

HTTP is a stateless protocol. Each request is independent, and the server does not remember previous requests. This design dates back to when Tim Berners-Lee designed HTTP in 1991 to deliver HTML documents. Each request establishes a new TCP connection (or reuses one via HTTP Keep-Alive) and repeatedly transmits headers. You can mimic real-time with polling, but there's a fundamental limitation: the client has to ask the server about changes.

WebSocket (RFC 6455, 2011) solves this problem with the HTTP Upgrade mechanism. The first connection starts as HTTP but immediately upgrades to the WebSocket protocol.

```
Client → Server:
GET /chat HTTP/1.1
Host: api.example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

Server → Client:
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

After this handshake, the TCP connection becomes a bidirectional channel that exchanges WebSocket frames. You can exchange messages as frames of a few bytes, without the HTTP header overhead.

> 💡 **Related theory**: The `Sec-WebSocket-Accept` value is the Base64 encoding of the SHA-1 hash of `Sec-WebSocket-Key` concatenated with the GUID `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`. This is a security mechanism that prevents a proxy/cache unaware of WebSocket from mistaking a WebSocket connection for an ordinary HTTP request and caching it. An ordinary HTTP cache cannot interpret this special response.

API Gateway WebSocket API implements this protocol as a fully managed service. The client connects to a `wss://` (TLS over WebSocket) endpoint, and API Gateway assigns each connection a unique `connectionId`.

---

## The WebSocket API Connection Lifecycle: From $connect to GoneException

Every WebSocket API event is handled by three system routes plus user-defined routes.

```
Connection establishment:
Client ──wss://── API Gateway
                           │
                    connectionId generated
                           │
                    $connect route → Lambda
                           │
                    Lambda returns 200 → connection completed
                    Lambda 4XX/5XX → connection rejected
                           │
                    Persistent connection maintained with client

Message exchange:
Client → message → API Gateway
                    routeSelectionExpression evaluated
                           │
                    Route key determined (e.g., "sendMessage")
                           │
                    That route's Lambda runs
                           │
                    Lambda → post_to_connection() → Client

Connection termination:
Client disconnect, or Idle Timeout (10 min), or Max Duration (2 hours)
                           │
                    $disconnect route → Lambda
                           │
                    Cleanup (delete connectionId from DynamoDB)
```

The **`$connect` route** is the heart of connection authentication. The connection is established only if Lambda returns `statusCode: 200`. At this point you can apply IAM authentication, a Lambda Authorizer, or a Cognito Authorizer. Saving the `connectionId` to a database in `$connect` is the standard pattern.

The **`$disconnect` route** runs when the connection is severed for any reason. The important point is that **execution of `$disconnect` is not guaranteed** — it may not run on an abnormal disconnect such as a forced network termination. Therefore you need a secondary cleanup mechanism using DynamoDB TTL.

The **Route Selection Expression** determines the route based on message content:

```python
# API Gateway configuration
routeSelectionExpression = "$request.body.action"

# Message 1 the client sends
{"action": "sendMessage", "data": "Hello"}
# → runs the "sendMessage" route Lambda

# Message 2 the client sends
{"action": "joinRoom", "roomId": "chat-01"}
# → runs the "joinRoom" route Lambda

# If no route matches
# → runs the "$default" route Lambda
```

> ⚠️ **Trap**: If the field the Route Selection Expression references is absent from the message, it always routes to `$default`. Even if the client sends plain text instead of JSON, it goes to `$default`. If there is no `$default` route, API Gateway returns an error.

**Sending a message from server to client** uses the API Gateway Management API's `post_to_connection`. This API can be called anytime a Lambda function knows the `connectionId` — from outside the WebSocket Lambda handler, and even from a different Lambda triggered by an SNS or SQS event.

```python
import json
import boto3

def broadcast_message(message: str, connections: list, stage: str, api_id: str, region: str):
    """Broadcast to all connected clients"""
    endpoint_url = f"https://{api_id}.execute-api.{region}.amazonaws.com/{stage}"
    
    apigw_management = boto3.client(
        "apigatewaymanagementapi",
        endpoint_url=endpoint_url
    )
    
    stale_connections = []
    
    for connection_id in connections:
        try:
            apigw_management.post_to_connection(
                ConnectionId=connection_id,
                Data=json.dumps({"type": "broadcast", "message": message}).encode("utf-8")
            )
        except apigw_management.exceptions.GoneException:
            # Connection already severed → add to cleanup list
            stale_connections.append(connection_id)
        except apigw_management.exceptions.ForbiddenException:
            # Wrongly referenced a connectionId from a different stage
            pass
    
    return stale_connections  # caller handles deletion from DynamoDB


def lambda_handler(event, context):
    route_key = event["requestContext"]["routeKey"]
    connection_id = event["requestContext"]["connectionId"]
    domain_name = event["requestContext"]["domainName"]
    stage = event["requestContext"]["stage"]
    
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table("WebSocketConnections")
    
    if route_key == "$connect":
        # On connection, save to DynamoDB
        # TTL: auto-expire after 2 hours (cleaned up by DynamoDB TTL)
        import time
        table.put_item(Item={
            "connectionId": connection_id,
            "connectedAt": int(time.time()),
            "ttl": int(time.time()) + 7200  # 2-hour TTL
        })
        return {"statusCode": 200}
    
    elif route_key == "$disconnect":
        table.delete_item(Key={"connectionId": connection_id})
        return {"statusCode": 200}
    
    elif route_key == "sendMessage":
        body = json.loads(event.get("body", "{}"))
        message = body.get("message", "")
        
        # Look up all connections
        response = table.scan(ProjectionExpression="connectionId")
        all_connections = [item["connectionId"] for item in response["Items"]]
        
        # Broadcast
        api_id = event["requestContext"]["apiId"]
        region = "ap-northeast-2"
        stale = broadcast_message(message, all_connections, stage, api_id, region)
        
        # Clean up severed connections
        with table.batch_writer() as batch:
            for conn_id in stale:
                batch.delete_item(Key={"connectionId": conn_id})
        
        return {"statusCode": 200}
```

> 🔍 **Going deeper**: `GoneException` corresponds to HTTP 410 Gone. RFC 7231 defines 410 as meaning "the resource has been permanently deleted and is unlikely to be restored". Since a WebSocket connectionId cannot be reused once the connection is severed, 410 is the precise meaning. As soon as you receive a `GoneException`, you must delete that `connectionId` from DynamoDB — otherwise, unnecessary API calls accumulate on every broadcast.

**Connection limits** — the exam asks for specific numbers:

| Limit | Value |
|------|-----|
| Maximum connection duration | 2 hours |
| Idle Timeout (when there are no messages) | 10 minutes |
| Maximum size of a single frame | 128 KB |
| Maximum accumulated frame size | 128 KB (continuation frames need separate handling) |

> 📚 **Case study**: Slack uses WebSocket to deliver real-time events (messages, reactions, user status changes) to clients. According to a 2019 Slack Engineering blog, managing millions of concurrent WebSocket connections was one of the core infrastructure challenges. If you implemented this on AWS, the API Gateway WebSocket + DynamoDB connection registry pattern is the standard. Automatically cleaning up stale connections from abnormal terminations with DynamoDB's `TTL` is essential.

---

## The Connection Registry Pattern with DynamoDB

The core pattern of WebSocket connection management is to use DynamoDB as a connection registry. Take a chat-room scenario as an example:

```
DynamoDB table: WebSocketConnections
────────────────────────────────────────
connectionId (PK) | roomId (GSI PK) | userId | connectedAt | ttl
─────────────────────────────────────────────────────────────────
conn_abc123       | room-001        | user-1 | 1703000000  | 1703007200
conn_def456       | room-001        | user-2 | 1703000100  | 1703007300
conn_ghi789       | room-002        | user-3 | 1703000200  | 1703007400

GSI: roomId-index (roomId → look up all connections in that room)
TTL: 2 hours after connection, deleted earlier by $disconnect
```

When broadcasting a message to a specific chat room:
1. Query the GSI with `roomId = "room-001"` → returns `conn_abc123`, `conn_def456`
2. Call `post_to_connection` on both connectionIds
3. Immediately delete any connectionId that got a `GoneException`

```python
def send_to_room(room_id: str, message: dict, apigw_client, table):
    """Send a message to all connections in a specific chat room"""
    # GSI query to look up only that room's connections (Query instead of Scan → efficient)
    response = table.query(
        IndexName="roomId-index",
        KeyConditionExpression="roomId = :rid",
        ExpressionAttributeValues={":rid": room_id}
    )
    
    for item in response["Items"]:
        conn_id = item["connectionId"]
        try:
            apigw_client.post_to_connection(
                ConnectionId=conn_id,
                Data=json.dumps(message).encode()
            )
        except apigw_client.exceptions.GoneException:
            table.delete_item(Key={"connectionId": conn_id})
```

> ⚠️ **Trap**: If you use `table.scan()` to look up all connections, the cost and time grow linearly as the number of connections increases. When you need a range lookup like a chat room, you must design a GSI. Scan is suitable only for a full broadcast (an announcement notification, etc.).

---

## HTTP API: How to Understand Its Internal Differences from REST API

HTTP API was announced as "API Gateway v2" at re:Invent 2019. Instead of removing many of REST API (v1)'s features, it greatly improved speed and cost. It's not simply "a budget REST API" — it's a separate product for different use cases.

The **Payload Format Version** is the biggest trap in HTTP API. Over 80% of problems when migrating from REST API to HTTP API arise here.

```python
# REST API Lambda Proxy event structure (= HTTP API Payload v1.0)
{
    "resource": "/users/{userId}",
    "path": "/users/123",
    "httpMethod": "GET",
    "headers": {"Accept": "application/json", ...},
    "queryStringParameters": {"filter": "active"},
    "pathParameters": {"userId": "123"},
    "stageVariables": null,
    "requestContext": {
        "resourceId": "abcd",
        "resourcePath": "/users/{userId}",
        "httpMethod": "GET",
        "stage": "prod",
        ...
    },
    "body": null,
    "isBase64Encoded": false
}

# HTTP API Payload v2.0 (default, more concise)
{
    "version": "2.0",
    "routeKey": "GET /users/{userId}",
    "rawPath": "/users/123",
    "rawQueryString": "filter=active",
    "headers": {"accept": "application/json", ...},
    "queryStringParameters": {"filter": "active"},
    "pathParameters": {"userId": "123"},
    "requestContext": {
        "accountId": "123456789012",
        "apiId": "abc123",
        "http": {
            "method": "GET",
            "path": "/users/123",
            "protocol": "HTTP/1.1",
            "sourceIp": "1.2.3.4",
            "userAgent": "Mozilla/5.0"
        },
        "routeKey": "GET /users/{userId}",
        "stage": "prod",
        "time": "12/Mar/2024:19:03:58 +0000"
    },
    "body": null,
    "isBase64Encoded": false
}
```

Key differences:
- v2.0 has no `resource`, `path`, or `httpMethod` fields
- v2.0 has a `routeKey` field
- v2.0 uses `requestContext.http` instead of `requestContext.identity`
- v2.0 normalizes header names to lowercase

If you attach an existing REST API Lambda to HTTP API v2.0, code like `event["httpMethod"]` raises a `KeyError`. On migration, either set `payload_format_version: "1.0"` or modify the Lambda code.

**HTTP API vs REST API complete comparison**:

| Feature | REST API | HTTP API | WebSocket API |
|------|----------|----------|---------------|
| Lambda Proxy integration | ✅ | ✅ | ✅ |
| Lambda Non-Proxy (VTL) | ✅ | ❌ | ❌ |
| HTTP integration | ✅ | ✅ | ❌ |
| Direct AWS Service integration | ✅ | ❌ | ❌ |
| MOCK integration | ✅ | ❌ | ❌ |
| IAM authentication | ✅ | ✅ | ✅ |
| Lambda Authorizer | ✅ | ✅ | ✅ |
| Cognito User Pool Authorizer | ✅ | ❌ | ❌ |
| JWT Authorizer (OIDC) | ❌ | ✅ | ❌ |
| API Key + Usage Plan | ✅ | ❌ | ❌ |
| Resource Policy | ✅ | ❌ | ❌ |
| mTLS | ✅ | ✅ | ❌ |
| WAF | ✅ | ❌ (via CF) | ❌ |
| Response Caching | ✅ | ❌ | ❌ |
| Request Validation | ✅ | ❌ | ❌ |
| Gateway Response customization | ✅ | ❌ | ❌ |
| X-Ray Tracing | ✅ | ❌ | ❌ |
| Canary Deployment | ✅ | ❌ | ❌ |
| VPC Link (Private integration) | NLB only | ALB/NLB/CloudMap | ❌ |
| Cost (per million calls) | ~$3.50 | ~$1.00 | Connection time & message count |
| Automatic CORS setup | ❌ (manual) | ✅ | N/A |

> 🔍 **Going deeper**: The reason HTTP API is faster than REST API is that its processing pipeline is simpler. REST API passes through many middleware layers such as VTL mapping, request validation, usage plan evaluation, and cache lookup. HTTP API removed these layers to reduce latency and lower cost. This aligns with the software design principle of removing "accidental complexity" — you don't pay the overhead of features you don't need.

---

## HTTP API JWT Authorizer: Code-Free OIDC Validation

HTTP API natively supports a JWT Authorizer that follows the OIDC (OpenID Connect) standard. Without any Lambda code, you can validate JWTs from Cognito, Auth0, Okta, and so on with just JSON configuration.

```yaml
# HTTP API + JWT Authorizer with a SAM template
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31

Resources:
  MyHttpApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      Auth:
        DefaultAuthorizer: CognitoJWTAuthorizer
        Authorizers:
          CognitoJWTAuthorizer:
            IdentitySource: $request.header.Authorization
            JwtConfiguration:
              issuer: !Sub "https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPoolId}"
              audience:
                - !Ref UserPoolClientId

  GetUsersFunction:
    Type: AWS::Serverless::Function
    Properties:
      Handler: app.lambda_handler
      Runtime: python3.12
      Events:
        GetUsers:
          Type: HttpApi
          Properties:
            ApiId: !Ref MyHttpApi
            Path: /users
            Method: GET
            # This route applies DefaultAuthorizer (JWT validation required)
            
        HealthCheck:
          Type: HttpApi
          Properties:
            ApiId: !Ref MyHttpApi
            Path: /health
            Method: GET
            Auth:
              Authorizer: NONE  # only this route is excluded from auth
```

The JWT Authorizer's validation flow:
1. Extract the Bearer token from the client's `Authorization` header
2. Confirm the JWT's `iss` (issuer) claim matches the configured issuer URL
3. Fetch the public key from the issuer's JWKS endpoint (cached)
4. Verify the JWT signature
5. Confirm the JWT's `aud` (audience) claim is in the configured audience list
6. Check JWT expiration (`exp`)
7. All pass → the backend integration is called

> ⚠️ **Trap**: In Cognito, the Access Token and ID Token are different. If the JWT Authorizer's `audience` setting is configured to validate the Access Token but you send the ID Token, the `aud` claim won't match and a 401 is returned. A Cognito Access Token's `aud` is not the client ID — its `"token_use": "access"` value is handled differently. REST API's Cognito User Pool Authorizer is designed to handle the Access Token, but the HTTP API JWT Authorizer defaults to the ID Token.

---

## VPC Link: Connecting Private-Subnet Backends to API Gateway

A VPC Link is a private integration mechanism by which API Gateway calls resources inside a VPC (EC2, ECS, ALB, NLB) directly without going through the internet.

```
Internet → API Gateway → VPC Link → Private Subnet
                                        └── ALB → ECS Fargate
                                        └── NLB → EC2
                                        └── Cloud Map (HTTP API only)
```

The difference in VPC Link support between REST API and HTTP API:

| | REST API VPC Link | HTTP API VPC Link |
|---|---|---|
| Supported backends | NLB only | ALB, NLB, Cloud Map |
| Creation time | ~20 min | ~20 min |
| Same account only | ✅ | ✅ |
| Cross-account | ❌ | ❌ |

```bash
# Create an HTTP API VPC Link and configure the integration
# 1. Create the VPC Link
VPC_LINK_ID=$(aws apigatewayv2 create-vpc-link \
  --name "MyVpcLink" \
  --subnet-ids subnet-abc123 subnet-def456 \
  --security-group-ids sg-xyz789 \
  --query 'VpcLinkId' --output text)

# 2. Use the VPC Link in an HTTP API integration
aws apigatewayv2 create-integration \
  --api-id abc123 \
  --integration-type HTTP_PROXY \
  --integration-uri arn:aws:elasticloadbalancing:...:listener/app/my-alb/... \
  --connection-type VPC_LINK \
  --connection-id $VPC_LINK_ID \
  --integration-method GET \
  --payload-format-version "1.0"
```

---

## Server-Sent Events vs WebSocket: Choosing a Real-Time Communication Method

When you need real-time features, WebSocket is not always the answer. Depending on the traffic direction and complexity, SSE (Server-Sent Events) may be a better fit.

| Item | WebSocket | SSE | Long Polling |
|------|-----------|-----|-------------|
| Communication direction | Bidirectional | Server → client only | Server → client |
| Protocol | ws:// / wss:// | HTTP | HTTP |
| Browser support | ✅ | ✅ (except IE) | ✅ |
| Automatic reconnection | Implement it yourself | ✅ (built into the browser) | Implement it yourself |
| Firewall friendliness | Low (non-standard ports) | High (HTTP) | High |
| AWS implementation | WebSocket API | Lambda Response Streaming + Function URL | REST API |
| Suitable use case | Chat, gaming, collaboration tools | AI response streaming, notifications | Simple polling |

> 💡 **Related theory**: SSE is implemented with chunked transfer encoding using HTTP/1.1's `text/event-stream` Content-Type. The HTTP connection stays open while the server streams data. Combined with Lambda's Response Streaming, you can incrementally deliver long text like an LLM API response to the client. Lambda Function URL directly supports the SSE pattern, but API Gateway WebSocket does not.

---

## Lambda Function URL vs HTTP API: When to Use What

Lambda Function URL was launched in 2022. It's a feature that gives a Lambda an HTTPS endpoint directly, without a separate API Gateway.

| Item | Lambda Function URL | HTTP API | REST API |
|------|---------------------|----------|----------|
| Cost | Lambda charges only (endpoint free) | $1.00/million calls | $3.50/million calls |
| Custom domain | ❌ (aws.lambda.url format) | ✅ | ✅ |
| Multiple routes/functions | ❌ (single function only) | ✅ | ✅ |
| Auth | NONE or AWS_IAM | JWT/IAM/Lambda Authorizer | All supported |
| Response Streaming | ✅ | ❌ | ❌ |
| CORS | Configurable | Automatic | Manual |
| Throttling | Lambda concurrency limit only | API GW throttling + Lambda | API GW + Lambda |
| WAF | ❌ | ❌ | ✅ |

**Selection guidelines**:
- Quickly expose a single function over HTTPS, minimize cost → **Function URL**
- Route multiple Lambdas, Cognito/Auth0 JWT auth, automatic CORS → **HTTP API**
- API keys + usage plans, VTL transformation, caching, WAF, X-Ray → **REST API**
- Chat / real-time bidirectional communication → **WebSocket API**

> 📚 **Case study**: Services like Vercel's Edge Functions and Cloudflare Workers offer a "instantly expose a single function" pattern similar to Function URL. This pattern gained popularity with the rise of the JAMstack architecture in 2020. When deploying Next.js serverless on AWS, deploying each API Route as a separate Lambda and exposing it via a Function URL is used in some cases, but in complex production environments it's common to put an API Gateway HTTP API in front.

---

## 📝 연습 문제

**문제 1.**  
In a WebSocket API, the route that runs when a client establishes a connection is `$connect`. What happens if the Lambda function returns `statusCode: 403`?

A) The connection is established and subsequent messages are processed normally  
B) The connection is rejected and the client cannot connect  
C) It falls back to the `$default` route  
D) The connection is established but `$disconnect` is called immediately  

**정답: B**  
If the `$connect` Lambda returns a 4XX or 5XX, the WebSocket handshake is rejected. The connection itself is not established. You can use this to implement authentication logic in `$connect` — for example, receiving a JWT token as a query parameter, validating it, and returning 403 if it's invalid.

---

**문제 2.**  
In a real-time chat application, the server's Lambda attempted a broadcast and got a `GoneException` for some clients. What is the correct way to handle this?

A) Retry with the same connectionId after a short delay  
B) Immediately delete that connectionId from DynamoDB  
C) Manually trigger the `$disconnect` route  
D) Ask API Gateway to renew the connectionId  

**정답: B**  
A `GoneException` (HTTP 410) means the WebSocket connection for that connectionId has been permanently severed. Since a connectionId is not reused, retrying is meaningless. You must immediately delete that connectionId from DynamoDB so that no unnecessary API calls occur in future broadcasts.

---

**문제 3.**  
You migrated an existing REST API Lambda function to HTTP API, and `KeyError: 'httpMethod'` occurred. What is the cause and solution?

A) HTTP API doesn't support the GET method. Keep the REST API  
B) HTTP API Payload v2.0 is the default and the event structure is different. Set payload_format_version to "1.0" or modify the Lambda code  
C) It's an IAM permission problem. Add permissions to the Lambda execution role  
D) HTTP API doesn't support Lambda Proxy integration  

**정답: B**  
HTTP API uses Payload Format Version 2.0 by default. v2.0 uses `requestContext.http.method` instead of `httpMethod` and includes new fields like `routeKey`. Changing the integration setting to `payloadFormatVersion: "1.0"` makes it identical to the existing REST API event structure.

---

**문제 4.**  
A company wants to implement API authentication with Auth0 JWT tokens. What is the simplest way to implement it, without Lambda Authorizer code?

A) Configure a Cognito User Pool Authorizer on the REST API and use Auth0 in place of Cognito  
B) Configure a JWT Authorizer on the HTTP API and specify Auth0's issuer URL and audience  
C) Allow Auth0's IP via a Resource Policy on the REST API  
D) External JWT validation is impossible without a Lambda Authorizer  

**정답: B**  
HTTP API's JWT Authorizer supports any provider that follows the OIDC standard. For Auth0, specifying `issuer: "https://{your-domain}.auth0.com/"` and `audience: ["{your-api-identifier}"]` enables JWT validation with no Lambda code. REST API's Cognito User Pool Authorizer supports only Cognito.

---

**문제 5.**  
You need to continuously stream real-time stock prices from the server to clients. Clients only receive data and don't need to send data to the server. What is the simplest AWS implementation?

A) WebSocket API + DynamoDB connection management  
B) REST API long polling  
C) Lambda Response Streaming + Function URL (SSE pattern)  
D) SQS + client polling  

**정답: C**  
For server → client one-way streaming, the SSE pattern is simpler than WebSocket. Leveraging Lambda's Response Streaming, you can stream real-time data in `text/event-stream` format combined with a Function URL. WebSocket is for when bidirectional communication is needed, and it brings additional complexity such as managing a DynamoDB connection registry.

---

**문제 6.**  
Why is API Gateway HTTP API cheaper than REST API?

A) HTTP API doesn't use Lambda, so there's no Lambda cost  
B) HTTP API removes many middleware layers such as VTL transformation, caching, and usage plan evaluation, so processing overhead is low  
C) HTTP API caches via CloudFront, so the actual number of API calls is lower  
D) HTTP API processes only a subset of requests through sampling  

**정답: B**  
HTTP API's low cost and low latency stem from its simplified processing pipeline. HTTP API doesn't include the middleware layers REST API supports — VTL mapping, response caching, usage plan evaluation, Gateway Response customization, X-Ray integration, and so on. It's a trade-off that improved speed and cost by cutting features.

---

**문제 7.**  
What are the WebSocket API's Idle Timeout and Maximum Connection Duration, respectively? And what happens to a connection that exceeds these limits?

A) Idle Timeout 5 min, Max Duration 1 hour → automatic reconnection  
B) Idle Timeout 10 min, Max Duration 2 hours → connection forcibly terminated and $disconnect route runs  
C) Idle Timeout 30 min, Max Duration 24 hours → the connection is maintained  
D) Idle Timeout 10 min, Max Duration 2 hours → connection forcibly terminated, $disconnect not guaranteed to run  

**정답: D**  
The Idle Timeout is 10 minutes (when there are no messages or pings), and the Maximum Connection Duration is 2 hours. When these limits are exceeded, the connection is forcibly terminated, and execution of the `$disconnect` route is **not guaranteed**. Therefore you must set a DynamoDB TTL aligned with the maximum connection duration to automatically clean up stale connections from abnormal terminations.
