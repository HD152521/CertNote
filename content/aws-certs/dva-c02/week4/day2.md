# Day 17 - API Gateway 통합 유형과 VTL 매핑 템플릿: Lambda 없이 DynamoDB를 직접 호출하기

API Gateway가 단순히 "Lambda의 HTTP 프록시"라고 생각한다면 절반만 아는 것이다. API Gateway는 Lambda 없이도 DynamoDB, SQS, Kinesis, S3 같은 AWS 서비스를 직접 호출할 수 있다. 이 패턴이 실무에서 의미 있는 이유는 명확하다 — Lambda를 거치지 않으면 레이턴시가 줄고, 비용이 줄고, 관리할 코드가 없어진다.

오늘은 API Gateway의 다섯 가지 통합 유형을 해부하고, VTL(Velocity Template Language) 매핑 템플릿으로 요청·응답을 변환하는 방법을 파고든다. Lambda Proxy vs non-Proxy의 차이를 코드 레벨에서 이해하면 "왜 CORS가 안 되지?", "왜 응답 형식이 깨지지?" 같은 실무 문제가 즉각 해결된다.

## 다섯 가지 통합 유형의 결정 트리

```
백엔드가 필요한가?
    │
    ├── 아니오 (개발/테스트 단계) → MOCK 통합
    │
    └── 예
         │
         ├── Lambda 함수?
         │    ├── 변환 없이 그대로 전달 → AWS_PROXY (Lambda Proxy)
         │    └── VTL로 변환 필요 → AWS (Lambda non-Proxy)
         │
         ├── 외부 HTTP 엔드포인트?
         │    ├── 그대로 전달 → HTTP_PROXY
         │    └── VTL로 변환 → HTTP
         │
         └── AWS 서비스 직접?
              └── AWS (Service Integration) + VTL 매핑
```

## AWS_PROXY (Lambda Proxy): 가장 많이 쓰이는 이유

Lambda Proxy 통합은 API Gateway가 요청을 변환하지 않고 Lambda로 그대로 전달한다. 대신 Lambda가 완전한 HTTP 응답 형식을 반환해야 한다.

**Lambda가 받는 이벤트 구조:**
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

**Lambda가 반환해야 하는 응답 구조:**
```python
def lambda_handler(event, context):
    http_method = event['httpMethod']
    path_params = event.get('pathParameters', {}) or {}
    query_params = event.get('queryStringParameters', {}) or {}
    
    # body는 항상 문자열 — JSON이면 직접 파싱
    body = json.loads(event.get('body') or '{}')
    
    # requestContext.authorizer에서 인증 정보 추출
    user_id = event['requestContext']['authorizer']['userId']
    
    return {
        'statusCode': 200,  # 필수
        'headers': {        # 선택 (CORS를 위해 거의 필수)
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'X-Request-Id': event['requestContext']['requestId']
        },
        'multiValueHeaders': {  # 선택 (하나의 헤더 키에 여러 값)
            'Set-Cookie': ['session=abc', 'csrf=xyz']
        },
        'body': json.dumps({   # 필수 (반드시 문자열)
            'productId': path_params.get('productId'),
            'name': '상품명'
        }, ensure_ascii=False),
        'isBase64Encoded': False  # 바이너리 응답이면 True
    }
```

> ⚠️ **함정**: Lambda Proxy에서 `body`는 항상 문자열이다. 객체를 그대로 반환하면 Lambda가 직렬화하지 못해 에러가 난다. `json.dumps(data)`로 문자열화하거나, 반대로 이벤트에서 받은 body를 사용할 때는 `json.loads(event['body'])`로 파싱해야 한다. `event['queryStringParameters']`가 쿼리 파라미터가 없을 때 `None`이 될 수 있으므로 `or {}`로 안전하게 처리한다.

## AWS (Lambda Non-Proxy): VTL로 요청과 응답을 변환

non-Proxy 통합은 API Gateway가 VTL(Velocity Template Language)로 요청을 변환한 후 Lambda를 호출하고, Lambda의 응답도 VTL로 변환해 클라이언트에 돌려준다. Lambda Proxy보다 복잡하지만 Lambda 코드를 단순하게 유지할 수 있다.

실제 코드는 이벤트 구조를 알 필요 없이 비즈니스 로직만 담으면 되고, API Gateway가 입출력을 담당한다.

**통합 요청 VTL (API GW → Lambda):**
```velocity
## 경로 파라미터와 쿼리 파라미터를 Lambda가 원하는 형식으로 변환
{
  "productId": "$input.params('productId')",
  "includeStock": "$input.params('includeStock')" == "true",
  "userId": "$context.authorizer.userId",
  "requestId": "$context.requestId"
}
```

**Lambda 코드 (단순화):**
```python
def lambda_handler(event, context):
    # 이제 이벤트는 API Gateway 구조가 아닌 VTL이 만든 단순 구조
    product_id = event['productId']
    include_stock = event['includeStock']
    
    product = get_product(product_id)
    if include_stock:
        product['stock'] = get_stock(product_id)
    
    return product  # 딕셔너리 그대로 반환 (statusCode 필요 없음)
```

**통합 응답 VTL (Lambda 응답 → API GW):**
```velocity
## Lambda가 반환한 JSON을 클라이언트용으로 변환
{
  "id": "$input.path('$.productId')",
  "name": "$input.path('$.name')",
  "price": $input.path('$.price'),
  #if($input.path('$.stock') != '')
  "stockAvailable": $input.path('$.stock')
  #end
}
```

**Integration Response에서 HTTP 상태 코드 매핑:**
```
Lambda 반환값의 errorType 필드에 정규식 매칭:
".*NotFound.*"   → 404
".*Unauthorized.*" → 403
".*BadRequest.*"   → 400
(default)          → 200
```

> 💡 **관련 이론**: VTL(Velocity Template Language)은 Apache Velocity 프로젝트(1999)에서 유래한다. Java 웹 개발의 템플릿 엔진으로 시작했고, 구문이 단순하고 로직 표현이 가능해 API Gateway가 채택했다. 하지만 AWS는 2022년 이후 새로운 기능을 REST API의 VTL보다 HTTP API의 단순 변환이나 Lambda Proxy로 방향을 잡는 추세다. 실무에서 VTL을 새로 작성하는 경우는 줄고 있지만, 시험에서는 여전히 핵심 개념이다.

## AWS 서비스 직접 통합: Lambda 없이 DynamoDB CRUD

API Gateway → DynamoDB 직접 통합의 실제 구현을 보면 VTL의 강력함을 알 수 있다.

**GET /orders/{orderId} → DynamoDB GetItem:**

통합 요청 설정:
- Type: AWS
- Service: DynamoDB
- Action: GetItem
- HTTP Method: POST (DynamoDB API는 모두 POST)

통합 요청 VTL:
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

DynamoDB 응답(원시 형식):
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

통합 응답 VTL (DynamoDB 형식 → 깔끔한 JSON):
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
# API Gateway → DynamoDB 직접 통합 설정
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

> 📚 **사례**: Pinterest는 2020년 실시간 피드 시스템에서 API Gateway → DynamoDB 직접 통합으로 Lambda를 완전히 제거했다. 단순 GetItem/PutItem 패턴에서 Lambda는 불필요한 중간 레이어였다. 이를 통해 P99 레이턴시를 120ms에서 45ms로 낮추고, Lambda 비용을 0으로 만들었다. 단, 복잡한 비즈니스 로직이 필요한 엔드포인트는 여전히 Lambda를 사용한다.

## Gateway Response: API Gateway 자체 에러의 커스터마이징

API Gateway가 자체적으로 생성하는 에러(Lambda를 호출하기 전에 발생하는 인증 실패, 스로틀링, 잘못된 요청 등)를 커스터마이징한다.

| 에러 타입 | 기본 발생 상황 |
|----------|--------------|
| `UNAUTHORIZED` | Lambda Authorizer가 401 반환 |
| `ACCESS_DENIED` | IAM 인증 실패 |
| `THROTTLED` | 스로틀링 한도 초과 |
| `MISSING_AUTHENTICATION_TOKEN` | 잘못된 경로/메서드 |
| `DEFAULT_4XX` | 모든 4XX 기본 응답 |
| `DEFAULT_5XX` | 모든 5XX 기본 응답 |

```bash
# 401 응답에 CORS 헤더 추가 (Lambda Proxy에서 CORS 헤더가 없는 에러에 대응)
aws apigateway put-gateway-response \
  --rest-api-id abc123 \
  --response-type UNAUTHORIZED \
  --response-parameters '{"gatewayresponse.header.Access-Control-Allow-Origin": "'"'"'*'"'"'"}'  \
  --response-templates '{"application/json": "{\"message\": \"인증이 필요합니다\", \"code\": \"UNAUTHORIZED\"}"}'
```

> ⚠️ **함정**: Lambda Proxy + REST API 조합에서 CORS 문제가 흔하다. 정상 응답은 Lambda가 `Access-Control-Allow-Origin` 헤더를 반환하므로 잘 된다. 하지만 **API Gateway 자체에서 에러가 발생**할 때(Lambda Authorizer가 거부하거나, 스로틀링될 때) API Gateway가 반환하는 에러에는 CORS 헤더가 없다. 브라우저는 CORS 헤더가 없는 에러를 "CORS 에러"로 표시한다. Gateway Response를 설정하면 API Gateway 자체 에러에도 CORS 헤더를 붙일 수 있다.

## VTL 핵심 변수와 함수

| 변수 | 설명 | 예시 |
|------|------|------|
| `$input.body` | 요청 본문 원본 문자열 | `{"name":"test"}` |
| `$input.json('$.field')` | JSONPath로 필드 추출 | `$input.json('$.name')` |
| `$input.params('name')` | 경로/헤더/쿼리 파라미터 | `$input.params('userId')` |
| `$input.path('$.key')` | 응답 JSON에서 값 추출 | `$input.path('$.Items')` |
| `$context.requestId` | 요청 ID | `abc-123-def` |
| `$context.identity.sourceIp` | 클라이언트 IP | `203.0.113.1` |
| `$context.authorizer.userId` | Lambda Authorizer 반환 값 | `U001` |
| `$context.authorizer.claims.sub` | Cognito JWT sub | `auth0|xxx` |
| `$stageVariables.varName` | 스테이지 변수 | `prod` |
| `$util.escapeJavaScript(str)` | JS 이스케이프 | XSS 방지 |
| `$util.base64Encode(str)` | Base64 인코딩 | 바이너리 처리 |
| `$util.parseJson(str)` | JSON 파싱 | 중첩 JSON 처리 |

**VTL 제어 구문:**
```velocity
## if/elseif/else
#if($input.params('filter') == 'active')
  "status": "ACTIVE"
#elseif($input.params('filter') == 'inactive')
  "status": "INACTIVE"
#else
  "status": "ALL"
#end

## foreach 반복
#foreach($item in $items)
  {"id": "$item.id"}#if($foreach.hasNext),#end
#end

## 변수 설정
#set($tableName = "Orders-$stageVariables.env")
```

## CORS 처리: 통합 방식별 올바른 구현

CORS는 통합 방식에 따라 처리 방법이 다르다.

| 통합 방식 | OPTIONS preflight | CORS 헤더 위치 |
|----------|------------------|--------------|
| HTTP API | API GW 자동 처리 | API GW 설정에서 |
| REST API + Lambda Proxy | 수동 OPTIONS 메서드 + Mock | **Lambda 응답에 포함** |
| REST API + non-Proxy | 콘솔 "Enable CORS" 버튼 | API GW Integration Response |

**REST API + Lambda Proxy에서 완전한 CORS 구현:**

```python
# Lambda에서 모든 응답에 CORS 헤더 포함
def cors_headers():
    return {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'https://myapp.com',  # * 또는 특정 도메인
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Api-Key',
        'Access-Control-Max-Age': '86400'  # preflight 캐시 시간 (초)
    }

def lambda_handler(event, context):
    # OPTIONS 요청은 API Gateway가 Mock으로 처리하거나 Lambda에서 직접 처리
    if event['httpMethod'] == 'OPTIONS':
        return {'statusCode': 200, 'headers': cors_headers(), 'body': ''}
    
    # 실제 요청 처리
    result = process_request(event)
    
    return {
        'statusCode': 200,
        'headers': cors_headers(),
        'body': json.dumps(result)
    }
```

## Binary Media Types: 이미지·PDF 처리

API Gateway는 기본적으로 JSON을 처리한다. 이미지(JPEG, PNG), PDF 같은 바이너리를 처리하려면 Binary Media Types를 설정해야 한다.

```bash
# REST API에 Binary Media Types 등록
aws apigateway update-rest-api \
  --rest-api-id abc123 \
  --patch-operations \
    'op=add,path=/binaryMediaTypes/image~1jpeg' \
    'op=add,path=/binaryMediaTypes/image~1png' \
    'op=add,path=/binaryMediaTypes/application~1pdf'
```

Lambda에서 바이너리 응답:
```python
import base64

def lambda_handler(event, context):
    # 파일 읽기
    with open('/tmp/image.jpg', 'rb') as f:
        image_data = f.read()
    
    return {
        'statusCode': 200,
        'headers': {'Content-Type': 'image/jpeg'},
        'body': base64.b64encode(image_data).decode('utf-8'),
        'isBase64Encoded': True  # API GW가 자동으로 디코드해서 전달
    }
```

> 🔍 **더 깊이**: API Gateway의 Content Negotiation은 HTTP 표준 `Accept` 헤더를 사용한다. 클라이언트가 `Accept: image/jpeg`를 보내고, Binary Media Types에 `image/jpeg`가 등록되어 있으면 API GW가 base64 디코딩해서 바이너리로 전달한다. `Accept: application/json`을 보내면 base64 인코딩된 문자열 그대로 전달한다. 이 협상이 잘못 설정되면 이미지가 깨져 보이는 문제가 발생한다.

## 요청 검증: Lambda 호출 전에 차단하기

요청 검증은 잘못된 요청을 Lambda 호출 전에 400으로 차단해 비용을 절감하고 백엔드를 보호한다.

검증 가능 항목:
1. **경로 파라미터**: 필수 파라미터 존재 여부
2. **쿼리 파라미터**: 필수 쿼리 파라미터 존재 여부
3. **헤더**: 필수 헤더 존재 여부
4. **요청 본문**: JSON Schema 기반 구조 검증

```bash
# 요청 검증기 생성 (본문 검증만)
aws apigateway create-request-validator \
  --rest-api-id abc123 \
  --name ValidateBodyOnly \
  --validate-request-body true \
  --validate-request-parameters false

# JSON Schema 모델 생성
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

요청 검증 실패 시 Lambda 호출 없이 즉시 반환되는 응답:
```json
{
  "message": "Invalid request body"
}
```

## Mock 통합: 개발 초기 단계와 OPTIONS 처리

Mock 통합은 백엔드 없이 정적 응답을 반환한다. 사용 케이스:

1. **개발 초기**: 백엔드가 준비되기 전에 프론트엔드 개발 진행
2. **OPTIONS preflight**: REST API + Lambda Proxy에서 CORS OPTIONS 처리
3. **Health check**: `/health` 엔드포인트를 Lambda 없이 처리

```bash
# Mock 통합으로 OPTIONS 처리 (CORS preflight)
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

## 마무리

API Gateway 통합 유형을 선택하는 기준은 단순하다. 대부분의 경우는 Lambda Proxy(AWS_PROXY) — 빠르고 단순하다. Lambda 없이 AWS 서비스를 직접 호출하고 싶을 때는 AWS Service Integration + VTL. 요청·응답 변환이 복잡하거나 Lambda 코드를 순수하게 유지하고 싶을 때는 Lambda non-Proxy + VTL. CORS OPTIONS 처리나 개발 단계 목업은 Mock.

다음 글에서는 API Gateway의 보안 계층 — Lambda Authorizer의 내부 동작, Cognito와의 통합, 캐싱으로 비용 절감, 스로틀링 계층 구조 — 를 다룬다.

---

## 📝 연습 문제

**문제 1.** Lambda Proxy(AWS_PROXY) 통합에서 Lambda 함수가 반환해야 하는 최소 필수 필드는?

A) body만 필요  
B) statusCode와 body가 필수  
C) statusCode, headers, body 모두 필수  
D) 반환 형식이 자유롭다  

**정답: B**  
해설: Lambda Proxy 통합에서 Lambda 응답에 `statusCode`는 반드시 있어야 한다 — 없으면 API Gateway가 502 Bad Gateway를 반환한다. `body`는 null일 수 있지만 보통 포함한다. `headers`는 선택이지만 CORS가 필요하면 사실상 필수다. API Gateway가 해석하지 못하는 형식(statusCode가 없거나 정수가 아닌 경우)이면 모두 502로 처리된다.

---

**문제 2.** Lambda Proxy 통합에서 API Gateway 자체가 401 오류를 반환할 때 CORS 헤더가 없어서 브라우저에서 CORS 에러로 표시된다. 가장 적절한 해결책은?

A) Lambda 코드에 CORS 헤더를 추가한다  
B) Gateway Response에 Access-Control-Allow-Origin 헤더를 설정한다  
C) REST API를 HTTP API로 교체한다  
D) CloudFront에 CORS 헤더를 설정한다  

**정답: B**  
해설: Lambda Proxy에서 Lambda가 반환하는 응답에는 CORS 헤더를 포함할 수 있지만, API Gateway 자체가 생성하는 에러(401, 403, 429 등 — Lambda 호출 전 발생)에는 Lambda가 개입할 수 없다. Gateway Response를 설정하면 API Gateway 자체 에러에도 CORS 헤더를 붙일 수 있다. A는 Lambda 호출 전 에러에는 효과 없다. C는 HTTP API로 교체하면 다른 기능(캐싱, API 키 등)을 잃을 수 있다.

---

**문제 3.** API Gateway에서 Lambda 없이 DynamoDB에 직접 Item을 Put하려면 어떤 통합 유형과 설정이 필요한가?

A) Lambda Proxy 통합 + Lambda에서 DynamoDB SDK 호출  
B) HTTP 통합 + DynamoDB HTTP API  
C) AWS Service 통합 + VTL 매핑 템플릿 + IAM 역할  
D) Mock 통합 + DynamoDB Event Notification  

**정답: C**  
해설: AWS Service 직접 통합은 API Gateway가 지정된 IAM 역할의 권한으로 직접 AWS API를 호출한다. VTL 매핑 템플릿으로 클라이언트 요청을 DynamoDB `PutItem` 요청 형식으로 변환하고, DynamoDB 응답을 VTL로 클라이언트 응답 형식으로 변환한다. 이를 통해 Lambda 없이도 CRUD 작업이 가능하다. A는 Lambda 없는 직접 통합이 아니다. B는 DynamoDB는 HTTP API가 없다.

---

**문제 4.** VTL 매핑 템플릿에서 Lambda Authorizer가 반환한 `userId` 값을 DynamoDB 요청에 포함시키려면 어떤 변수를 사용하는가?

A) `$input.params('userId')`  
B) `$event.requestContext.authorizer.userId`  
C) `$context.authorizer.userId`  
D) `$lambda.authorizer.userId`  

**정답: C**  
해설: Lambda Authorizer가 반환하는 컨텍스트 값은 `$context.authorizer.*`로 접근한다. Lambda Authorizer의 `context` 딕셔너리에 `userId`를 넣었다면 VTL에서 `$context.authorizer.userId`로 참조한다. Cognito JWT의 경우 `$context.authorizer.claims.sub`, `$context.authorizer.claims.email` 등으로 접근한다. A는 경로/헤더/쿼리 파라미터 접근. B, D는 존재하지 않는 변수.

---

**문제 5.** REST API에서 요청 검증(Request Validation)을 활성화했을 때의 장점은?

A) Lambda 실행 속도가 빨라진다  
B) 잘못된 요청 형식을 Lambda 호출 전에 400으로 차단해 Lambda 비용을 절감한다  
C) 응답 캐싱이 자동 활성화된다  
D) CORS가 자동으로 설정된다  

**정답: B**  
해설: 요청 검증은 API Gateway가 백엔드를 호출하기 전에 요청의 경로 파라미터, 쿼리스트링, 헤더, 요청 본문(JSON Schema 기반)을 검사한다. 검증 실패 시 즉시 400 Bad Request를 반환하고 Lambda는 호출되지 않는다. 이는 잘못된 데이터로 인한 Lambda 호출 비용과 시간을 절감하고, 백엔드를 잘못된 입력으로부터 보호한다.

---

**문제 6.** Lambda Proxy 통합에서 `event['queryStringParameters']`를 안전하게 접근하는 방법은?

A) `event['queryStringParameters']`  
B) `event.queryStringParameters`  
C) `event.get('queryStringParameters', {}) or {}`  
D) `event['queryStringParameters'] if 'queryStringParameters' in event else {}`  

**정답: C**  
해설: 쿼리 파라미터가 없는 요청에서 `event['queryStringParameters']`는 `None`이 될 수 있다. `event.get('queryStringParameters', {})`는 키가 없을 때 `{}`를 반환하지만, 키는 있고 값이 `None`인 경우에는 `None`을 반환한다. `or {}`를 추가하면 `None`인 경우에도 `{}`로 처리된다. 이 패턴은 pathParameters, headers에서도 동일하게 적용된다.

