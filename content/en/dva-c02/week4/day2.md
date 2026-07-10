# Day 2 - API Gateway Integration Types and VTL Mapping Templates: Calling DynamoDB Directly Without Lambda

If you think API Gateway is simply "an HTTP proxy for Lambda", you only know half the story. API Gateway can call AWS services like DynamoDB, SQS, Kinesis, and S3 directly, without Lambda. The reason this pattern matters in practice is clear — skipping Lambda reduces latency, reduces cost, and leaves no code to manage.

Today we dissect API Gateway's five integration types and dig into how to transform requests and responses with VTL (Velocity Template Language) mapping templates. Once you understand the difference between Lambda Proxy and non-Proxy at the code level, real-world problems like "why doesn't CORS work?" and "why is my response format broken?" get solved instantly.

## A Decision Tree for the Five Integration Types

```
Do you need a backend?
    │
    ├── No (dev/test phase) → MOCK integration
    │
    └── Yes
         │
         ├── Lambda function?
         │    ├── Pass through without transformation → AWS_PROXY (Lambda Proxy)
         │    └── Transformation with VTL needed → AWS (Lambda non-Proxy)
         │
         ├── External HTTP endpoint?
         │    ├── Pass through as-is → HTTP_PROXY
         │    └── Transform with VTL → HTTP
         │
         └── AWS service directly?
              └── AWS (Service Integration) + VTL mapping
```

## AWS_PROXY (Lambda Proxy): Why It's the Most Widely Used

Lambda Proxy integration passes the request to Lambda as-is, without transforming it. In return, Lambda must return a complete HTTP response format.

**The event structure Lambda receives:**
```json
{
  "version": "1.0",
  "resource": "/products/{productId}",
  "path": "/products/P001",
  "httpMethod": "GET",
  "headers": {
    "Authorization": "Bearer eyJhbGciOiJSUzI1NiJ9...",
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0..."
  },
  "queryStringParameters": {
    "includeStock": "true",
    "lang": "ko"
  },
  "pathParameters": {
    "productId": "P001"
  },
  "stageVariables": {
    "env": "prod",
    "lambdaAlias": "prod"
  },
  "requestContext": {
    "accountId": "123456789",
    "apiId": "abc123",
    "stage": "prod",
    "requestId": "req-abc",
    "identity": {
      "sourceIp": "203.0.113.1",
      "userAgent": "Mozilla/5.0..."
    },
    "authorizer": {
      "userId": "U001",
      "scope": "read:products",
      "claims": {
        "sub": "auth0|xxx",
        "email": "user@example.com"
      }
    }
  },
  "body": null,
  "isBase64Encoded": false
}
```

**The response structure Lambda must return:**
```python
def lambda_handler(event, context):
    http_method = event['httpMethod']
    path_params = event.get('pathParameters', {}) or {}
    query_params = event.get('queryStringParameters', {}) or {}
    
    # body is always a string — parse it yourself if it's JSON
    body = json.loads(event.get('body') or '{}')
    
    # Extract auth info from requestContext.authorizer
    user_id = event['requestContext']['authorizer']['userId']
    
    return {
        'statusCode': 200,  # required
        'headers': {        # optional (practically required for CORS)
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-Request-Id': event['requestContext']['requestId']
        },
        'multiValueHeaders': {  # optional (multiple values for one header key)
            'Set-Cookie': ['session=abc', 'csrf=xyz']
        },
        'body': json.dumps({   # required (must be a string)
            'productId': path_params.get('productId'),
            'name': 'Product name'
        }, ensure_ascii=False),
        'isBase64Encoded': False  # True for binary responses
    }
```

> ⚠️ **Trap**: In Lambda Proxy, `body` is always a string. If you return an object directly, Lambda can't serialize it and errors out. Stringify it with `json.dumps(data)`, or conversely, when using the body received in the event, parse it with `json.loads(event['body'])`. Since `event['queryStringParameters']` can be `None` when there are no query parameters, handle it safely with `or {}`.

## AWS (Lambda Non-Proxy): Transform Request and Response with VTL

In non-Proxy integration, API Gateway transforms the request with VTL (Velocity Template Language) before calling Lambda, and also transforms Lambda's response with VTL before returning it to the client. It's more complex than Lambda Proxy, but it lets you keep Lambda code simple.

The actual code doesn't need to know the event structure — it just holds business logic, while API Gateway handles input and output.

**Integration request VTL (API GW → Lambda):**
```velocity
## Transform path and query parameters into the format Lambda wants
{
  "productId": "$input.params('productId')",
  "includeStock": "$input.params('includeStock')" == "true",
  "userId": "$context.authorizer.userId",
  "requestId": "$context.requestId"
}
```

**Lambda code (simplified):**
```python
def lambda_handler(event, context):
    # Now the event is the simple structure VTL built, not the API Gateway structure
    product_id = event['productId']
    include_stock = event['includeStock']
    
    product = get_product(product_id)
    if include_stock:
        product['stock'] = get_stock(product_id)
    
    return product  # return the dict directly (no statusCode needed)
```

**Integration response VTL (Lambda response → API GW):**
```velocity
## Transform the JSON returned by Lambda into a client-facing shape
{
  "id": "$input.path('$.productId')",
  "name": "$input.path('$.name')",
  "price": $input.path('$.price'),
  #if($input.path('$.stock') != '')
  "stockAvailable": $input.path('$.stock')
  #end
}
```

**Mapping HTTP status codes in Integration Response:**
```
Regex matching on the errorType field of Lambda's return value:
".*NotFound.*"   → 404
".*Unauthorized.*" → 403
".*BadRequest.*"   → 400
(default)          → 200
```

> 💡 **Related theory**: VTL (Velocity Template Language) originates from the Apache Velocity project (1999). It started as a template engine for Java web development, and API Gateway adopted it because its syntax is simple and it can express logic. However, since 2022, AWS has trended toward steering new features away from REST API's VTL and toward HTTP API's simple transformations or Lambda Proxy. Writing new VTL in practice is on the decline, but it remains a core concept on the exam.

## Direct AWS Service Integration: DynamoDB CRUD Without Lambda

Looking at an actual implementation of API Gateway → DynamoDB direct integration shows you the power of VTL.

**GET /orders/{orderId} → DynamoDB GetItem:**

Integration request settings:
- Type: AWS
- Service: DynamoDB
- Action: GetItem
- HTTP Method: POST (all DynamoDB APIs are POST)

Integration request VTL:
```velocity
{
  "TableName": "Orders",
  "Key": {
    "orderId": {
      "S": "$input.params('orderId')"
    }
  }
}
```

DynamoDB response (raw format):
```json
{
  "Item": {
    "orderId": {"S": "O001"},
    "status": {"S": "DELIVERED"},
    "total": {"N": "59900"},
    "items": {"L": [{"M": {"sku": {"S": "SKU001"}, "qty": {"N": "2"}}}]}
  }
}
```

Integration response VTL (DynamoDB format → clean JSON):
```velocity
#set($item = $input.path('$.Item'))
{
  "orderId": "$item.orderId.S",
  "status": "$item.status.S",
  "total": $item.total.N,
  "items": [
    #foreach($i in $item.items.L)
    {
      "sku": "$i.M.sku.S",
      "quantity": $i.M.qty.N
    }#if($foreach.hasNext),#end
    #end
  ]
}
```

```bash
# Configure API Gateway → DynamoDB direct integration
aws apigateway put-integration \
  --rest-api-id abc123 \
  --resource-id res001 \
  --http-method GET \
  --type AWS \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:ap-northeast-2:dynamodb:action/GetItem" \
  --credentials "arn:aws:iam::123:role/APIGatewayDynamoDBRole" \
  --request-templates 'application/json={"TableName":"Orders","Key":{"orderId":{"S":"$input.params('"'"'orderId'"'"')"}}}'
```

> 📚 **Case study**: In 2020, Pinterest eliminated Lambda entirely from its real-time feed system with API Gateway → DynamoDB direct integration. For simple GetItem/PutItem patterns, Lambda was an unnecessary intermediate layer. Through this they lowered P99 latency from 120ms to 45ms and drove Lambda cost to zero. That said, endpoints requiring complex business logic still use Lambda.

## Gateway Response: Customizing API Gateway's Own Errors

Customize the errors API Gateway generates on its own (authentication failures, throttling, malformed requests, and so on that occur before Lambda is called).

| Error type | Default trigger |
|----------|--------------|
| `UNAUTHORIZED` | Lambda Authorizer returns 401 |
| `ACCESS_DENIED` | IAM authentication failure |
| `THROTTLED` | Throttling limit exceeded |
| `MISSING_AUTHENTICATION_TOKEN` | Invalid path/method |
| `DEFAULT_4XX` | Default response for all 4XX |
| `DEFAULT_5XX` | Default response for all 5XX |

```bash
# Add CORS headers to a 401 response (handles errors that lack CORS headers under Lambda Proxy)
aws apigateway put-gateway-response \
  --rest-api-id abc123 \
  --response-type UNAUTHORIZED \
  --response-parameters '{"gatewayresponse.header.Access-Control-Allow-Origin": "'"'"'*'"'"'"}'  \
  --response-templates '{"application/json": "{\"message\": \"Authentication required\", \"code\": \"UNAUTHORIZED\"}"}'
```

> ⚠️ **Trap**: CORS problems are common with the Lambda Proxy + REST API combination. Normal responses work fine because Lambda returns the `Access-Control-Allow-Origin` header. But when **an error occurs in API Gateway itself** (a Lambda Authorizer rejects the request, or it gets throttled), the error API Gateway returns has no CORS headers. The browser reports an error without CORS headers as a "CORS error". Configuring a Gateway Response lets you attach CORS headers even to API Gateway's own errors.

## Core VTL Variables and Functions

| Variable | Description | Example |
|------|------|------|
| `$input.body` | Raw request body string | `{"name":"test"}` |
| `$input.json('$.field')` | Extract a field with JSONPath | `$input.json('$.name')` |
| `$input.params('name')` | Path/header/query parameter | `$input.params('userId')` |
| `$input.path('$.key')` | Extract a value from response JSON | `$input.path('$.Items')` |
| `$context.requestId` | Request ID | `abc-123-def` |
| `$context.identity.sourceIp` | Client IP | `203.0.113.1` |
| `$context.authorizer.userId` | Lambda Authorizer return value | `U001` |
| `$context.authorizer.claims.sub` | Cognito JWT sub | `auth0|xxx` |
| `$stageVariables.varName` | Stage variable | `prod` |
| `$util.escapeJavaScript(str)` | JS escaping | XSS prevention |
| `$util.base64Encode(str)` | Base64 encoding | Binary handling |
| `$util.parseJson(str)` | JSON parsing | Nested JSON handling |

**VTL control statements:**
```velocity
## if/elseif/else
#if($input.params('filter') == 'active')
  "status": "ACTIVE"
#elseif($input.params('filter') == 'inactive')
  "status": "INACTIVE"
#else
  "status": "ALL"
#end

## foreach loop
#foreach($item in $items)
  {"id": "$item.id"}#if($foreach.hasNext),#end
#end

## variable assignment
#set($tableName = "Orders-$stageVariables.env")
```

## CORS Handling: The Correct Implementation per Integration Type

CORS is handled differently depending on the integration type.

| Integration type | OPTIONS preflight | CORS header location |
|----------|------------------|--------------|
| HTTP API | Handled automatically by API GW | In API GW settings |
| REST API + Lambda Proxy | Manual OPTIONS method + Mock | **Included in the Lambda response** |
| REST API + non-Proxy | Console "Enable CORS" button | API GW Integration Response |

**A complete CORS implementation for REST API + Lambda Proxy:**

```python
# Include CORS headers on every response in Lambda
def cors_headers():
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://myapp.com',  # * or a specific domain
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
        'Access-Control-Max-Age': '86400'  # preflight cache time (seconds)
    }

def lambda_handler(event, context):
    # OPTIONS requests are handled by API Gateway via Mock, or handled directly in Lambda
    if event['httpMethod'] == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}
    
    # Handle the actual request
    result = process_request(event)
    
    return {
        'statusCode': 200,
        'headers': cors_headers(),
        'body': json.dumps(result)
    }
```

## Binary Media Types: Handling Images and PDFs

API Gateway handles JSON by default. To handle binary content like images (JPEG, PNG) and PDFs, you must configure Binary Media Types.

```bash
# Register Binary Media Types on the REST API
aws apigateway update-rest-api \
  --rest-api-id abc123 \
  --patch-operations \
    'op=add,path=/binaryMediaTypes/image~1jpeg' \
    'op=add,path=/binaryMediaTypes/image~1png' \
    'op=add,path=/binaryMediaTypes/application~1pdf'
```

Binary response in Lambda:
```python
import base64

def lambda_handler(event, context):
    # Read the file
    with open('/tmp/image.jpg', 'rb') as f:
        image_data = f.read()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'image/jpeg'},
        'body': base64.b64encode(image_data).decode('utf-8'),
        'isBase64Encoded': True  # API GW automatically decodes and delivers
    }
```

> 🔍 **Going deeper**: API Gateway's content negotiation uses the standard HTTP `Accept` header. If the client sends `Accept: image/jpeg` and `image/jpeg` is registered in Binary Media Types, API GW base64-decodes and delivers it as binary. If the client sends `Accept: application/json`, it delivers the base64-encoded string as-is. If this negotiation is misconfigured, you get the problem of broken-looking images.

## Request Validation: Blocking Before Lambda Is Called

Request validation blocks malformed requests with a 400 before Lambda is called, cutting costs and protecting the backend.

Validatable items:
1. **Path parameters**: whether required parameters exist
2. **Query parameters**: whether required query parameters exist
3. **Headers**: whether required headers exist
4. **Request body**: structural validation based on JSON Schema

```bash
# Create a request validator (body validation only)
aws apigateway create-request-validator \
  --rest-api-id abc123 \
  --name ValidateBodyOnly \
  --validate-request-body true \
  --validate-request-parameters false

# Create a JSON Schema model
aws apigateway create-model \
  --rest-api-id abc123 \
  --name CreateOrderRequest \
  --content-type 'application/json' \
  --schema '{
    "$schema": "http://json-schema.org/draft-04/schema#",
    "title": "CreateOrderRequest",
    "type": "object",
    "required": ["customerId", "items"],
    "properties": {
      "customerId": {"type": "string", "minLength": 1},
      "items": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "required": ["sku", "quantity"],
          "properties": {
            "sku": {"type": "string"},
            "quantity": {"type": "integer", "minimum": 1, "maximum": 100}
          }
        }
      },
      "deliveryDate": {"type": "string", "format": "date"}
    }
  }'
```

The response returned immediately on validation failure, with no Lambda call:
```json
{
  "message": "Invalid request body"
}
```

## Mock Integration: Early Development Phases and OPTIONS Handling

Mock integration returns a static response with no backend. Use cases:

1. **Early development**: proceed with frontend development before the backend is ready
2. **OPTIONS preflight**: handling CORS OPTIONS on REST API + Lambda Proxy
3. **Health check**: serving a `/health` endpoint without Lambda

```bash
# Handle OPTIONS with a Mock integration (CORS preflight)
aws apigateway put-integration \
  --rest-api-id abc123 \
  --resource-id res001 \
  --http-method OPTIONS \
  --type MOCK \
  --request-templates '{"application/json": "{\"statusCode\": 200}"}'

aws apigateway put-integration-response \
  --rest-api-id abc123 \
  --resource-id res001 \
  --http-method OPTIONS \
  --status-code 200 \
  --response-parameters '{
    "method.response.header.Access-Control-Allow-Origin": "'"'"'*'"'"'",
    "method.response.header.Access-Control-Allow-Methods": "'"'"'GET,POST,DELETE,OPTIONS'"'"'",
    "method.response.header.Access-Control-Allow-Headers": "'"'"'Content-Type,Authorization'"'"'"
  }'
```

## Wrapping Up

The criteria for choosing an API Gateway integration type are simple. In most cases it's Lambda Proxy (AWS_PROXY) — fast and simple. When you want to call an AWS service directly without Lambda, it's AWS Service Integration + VTL. When request/response transformation is complex or you want to keep Lambda code pure, it's Lambda non-Proxy + VTL. For CORS OPTIONS handling or dev-phase mocks, it's Mock.

In the next article, we cover API Gateway's security layer — the inner workings of the Lambda Authorizer, integration with Cognito, cost savings through caching, and the throttling hierarchy.

---

## 📝 연습 문제

**문제 1.** In a Lambda Proxy (AWS_PROXY) integration, what is the minimum set of required fields the Lambda function must return?

A) Only body is required  
B) statusCode and body are required  
C) statusCode, headers, and body are all required  
D) The return format is free-form  

**정답: B**  
해설: In a Lambda Proxy integration, the Lambda response must include `statusCode` — without it, API Gateway returns 502 Bad Gateway. `body` may be null but is usually included. `headers` is optional but effectively required if you need CORS. Any format API Gateway can't interpret (missing statusCode, or a non-integer statusCode) is all handled as a 502.

---

**문제 2.** In a Lambda Proxy integration, when API Gateway itself returns a 401 error, there are no CORS headers, so the browser displays it as a CORS error. What is the most appropriate solution?

A) Add CORS headers to the Lambda code  
B) Set the Access-Control-Allow-Origin header on the Gateway Response  
C) Replace the REST API with an HTTP API  
D) Set CORS headers on CloudFront  

**정답: B**  
해설: In Lambda Proxy, the response Lambda returns can include CORS headers, but errors API Gateway generates on its own (401, 403, 429, etc. — occurring before Lambda is called) are ones Lambda cannot intervene in. Configuring a Gateway Response lets you attach CORS headers even to API Gateway's own errors. A has no effect on errors that occur before Lambda is called. C — replacing with an HTTP API may cost you other features (caching, API keys, etc.).

---

**문제 3.** To Put an Item directly into DynamoDB from API Gateway without Lambda, what integration type and configuration are needed?

A) Lambda Proxy integration + calling the DynamoDB SDK from Lambda  
B) HTTP integration + DynamoDB HTTP API  
C) AWS Service integration + VTL mapping template + IAM role  
D) Mock integration + DynamoDB Event Notification  

**정답: C**  
해설: A direct AWS Service integration has API Gateway call the AWS API directly with the permissions of a specified IAM role. A VTL mapping template transforms the client request into the DynamoDB `PutItem` request format, and transforms the DynamoDB response into the client response format via VTL. This makes CRUD operations possible without Lambda. A is not a direct integration without Lambda. B is wrong because DynamoDB has no HTTP API.

---

**문제 4.** In a VTL mapping template, which variable do you use to include the `userId` value returned by a Lambda Authorizer in a DynamoDB request?

A) `$input.params('userId')`  
B) `$event.requestContext.authorizer.userId`  
C) `$context.authorizer.userId`  
D) `$lambda.authorizer.userId`  

**정답: C**  
해설: The context values returned by a Lambda Authorizer are accessed via `$context.authorizer.*`. If you put `userId` in the Lambda Authorizer's `context` dictionary, reference it as `$context.authorizer.userId` in VTL. For a Cognito JWT, access it as `$context.authorizer.claims.sub`, `$context.authorizer.claims.email`, etc. A is for accessing path/header/query parameters. B and D are non-existent variables.

---

**문제 5.** What is the benefit of enabling Request Validation on a REST API?

A) Lambda execution gets faster  
B) It blocks malformed request formats with a 400 before Lambda is called, cutting Lambda costs  
C) Response caching is enabled automatically  
D) CORS is configured automatically  

**정답: B**  
해설: Request validation has API Gateway inspect a request's path parameters, query string, headers, and request body (JSON Schema based) before calling the backend. On validation failure it immediately returns 400 Bad Request and Lambda is not called. This cuts the cost and time of Lambda invocations caused by bad data, and protects the backend from malformed input.

---

**문제 6.** In a Lambda Proxy integration, how do you safely access `event['queryStringParameters']`?

A) `event['queryStringParameters']`  
B) `event.queryStringParameters`  
C) `event.get('queryStringParameters', {}) or {}`  
D) `event['queryStringParameters'] if 'queryStringParameters' in event else {}`  

**정답: C**  
해설: On a request with no query parameters, `event['queryStringParameters']` can be `None`. `event.get('queryStringParameters', {})` returns `{}` when the key is missing, but returns `None` when the key exists and its value is `None`. Adding `or {}` handles the `None` case as `{}` too. This pattern applies equally to pathParameters and headers.
