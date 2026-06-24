# Day 4 - WebSocket API와 HTTP API: 실시간 연결과 경량 프록시의 내부 동작

API Gateway의 세 가지 API 유형(REST, HTTP, WebSocket)은 단순히 기능 차이가 아니라 근본적으로 다른 네트워킹 패러다임을 구현한다. REST API와 HTTP API는 HTTP/1.1의 요청-응답 모델 위에 구축되고, WebSocket API는 RFC 6455(WebSocket Protocol)의 지속적 양방향 연결을 구현한다. 어떤 API 유형을 선택하느냐는 아키텍처 설계 결정이며, 잘못 선택하면 70% 비용 낭비가 되거나 실시간 기능이 근본적으로 불가능해진다. 이 파일에서는 WebSocket API의 연결 생명주기와 HTTP API가 REST API와 어떻게 다른지를 내부 동작 수준에서 해부한다.

---

## WebSocket 프로토콜의 원리: 왜 HTTP와 근본적으로 다른가

HTTP는 Stateless 프로토콜이다. 각 요청은 독립적이며, 서버는 이전 요청을 기억하지 않는다. 이 설계는 1991년 팀 버너스리가 HTML 문서를 전달하기 위해 HTTP를 설계할 때부터의 것이다. 각 요청마다 TCP 연결을 새로 맺고(또는 HTTP Keep-Alive로 재사용하고) 헤더를 반복 전송한다. 폴링(Polling) 방식으로 실시간을 흉내 낼 수 있지만, 클라이언트가 서버에 변경사항을 물어봐야 한다는 근본적 한계가 있다.

WebSocket(RFC 6455, 2011)은 이 문제를 HTTP Upgrade 메커니즘으로 해결한다. 첫 번째 연결은 HTTP로 시작하지만, 즉시 WebSocket 프로토콜로 업그레이드된다.

```
클라이언트 → 서버:
GET /chat HTTP/1.1
Host: api.example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Version: 13

서버 → 클라이언트:
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

이 핸드셰이크 이후 TCP 연결은 WebSocket 프레임을 주고받는 양방향 채널이 된다. HTTP 헤더 오버헤드 없이 수 바이트짜리 프레임으로 메시지를 교환할 수 있다.

> 💡 **관련 이론**: `Sec-WebSocket-Accept` 값은 `Sec-WebSocket-Key`에 GUID `258EAFA5-E914-47DA-95CA-C5AB0DC85B11`을 붙여 SHA-1 해시한 Base64 인코딩이다. 이는 WebSocket을 인식하지 못하는 프록시/캐시가 WebSocket 연결을 일반 HTTP 요청으로 착각해 캐싱하는 것을 방지하는 보안 메커니즘이다. 일반 HTTP 캐시는 이 특수한 응답을 해석할 수 없다.

API Gateway WebSocket API는 이 프로토콜을 완전 관리형으로 구현한다. 클라이언트는 `wss://` (TLS over WebSocket) 엔드포인트에 연결하고, API Gateway는 각 연결에 고유한 `connectionId`를 부여한다.

---

## WebSocket API의 연결 생명주기: $connect부터 GoneException까지

WebSocket API의 모든 이벤트는 세 가지 시스템 라우트와 사용자 정의 라우트로 처리된다.

```
연결 수립:
클라이언트 ──wss://── API Gateway
                           │
                    connectionId 생성
                           │
                    $connect 라우트 → Lambda
                           │
                    Lambda 200 반환 → 연결 완료
                    Lambda 4XX/5XX → 연결 거부
                           │
                    클라이언트와 지속 연결 유지

메시지 교환:
클라이언트 → 메시지 → API Gateway
                    routeSelectionExpression 평가
                           │
                    라우트 키 결정 (예: "sendMessage")
                           │
                    해당 라우트 Lambda 실행
                           │
                    Lambda → post_to_connection() → 클라이언트

연결 종료:
클라이언트 연결 해제 또는 Idle Timeout(10분) 또는 Max Duration(2시간)
                           │
                    $disconnect 라우트 → Lambda
                           │
                    정리 작업 (DynamoDB에서 connectionId 삭제)
```

**`$connect` 라우트**는 연결 인증의 핵심이다. Lambda가 `statusCode: 200`을 반환해야만 연결이 수립된다. 이 시점에 IAM 인증, Lambda Authorizer, Cognito Authorizer를 적용할 수 있다. `$connect`에서 데이터베이스에 `connectionId`를 저장하는 것이 표준 패턴이다.

**`$disconnect` 라우트**는 연결이 어떤 이유로든 끊어질 때 실행된다. 중요한 점은 **`$disconnect`의 실행이 보장되지 않는다**는 것이다 — 네트워크 강제 종료 등 비정상 연결 해제 시 실행되지 않을 수 있다. 따라서 DynamoDB TTL을 활용한 보조 정리 메커니즘이 필요하다.

**Route Selection Expression**은 메시지 내용을 기반으로 라우트를 결정한다:

```python
# API Gateway 설정
routeSelectionExpression = "$request.body.action"

# 클라이언트가 보내는 메시지 1
{"action": "sendMessage", "data": "안녕하세요"}
# → "sendMessage" 라우트 Lambda 실행

# 클라이언트가 보내는 메시지 2
{"action": "joinRoom", "roomId": "chat-01"}
# → "joinRoom" 라우트 Lambda 실행

# 매칭되는 라우트가 없으면
# → "$default" 라우트 Lambda 실행
```

> ⚠️ **함정**: Route Selection Expression이 참조하는 필드가 메시지에 없으면 무조건 `$default`로 라우팅된다. 클라이언트가 JSON이 아닌 일반 텍스트를 보내도 `$default`로 간다. `$default` 라우트가 없으면 API Gateway가 오류를 반환한다.

**서버에서 클라이언트로 메시지 전송**은 API Gateway Management API의 `post_to_connection`을 사용한다. 이 API는 Lambda 함수가 `connectionId`를 알고 있는 한 언제든 호출할 수 있다 — WebSocket Lambda 핸들러 외부에서도, SNS나 SQS 이벤트를 트리거로 받은 다른 Lambda에서도 가능하다.

```python
import json
import boto3

def broadcast_message(message: str, connections: list, stage: str, api_id: str, region: str):
    """모든 연결된 클라이언트에게 브로드캐스트"""
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
            # 연결이 이미 끊어진 경우 → 정리 목록에 추가
            stale_connections.append(connection_id)
        except apigw_management.exceptions.ForbiddenException:
            # 다른 stage의 connectionId를 잘못 참조한 경우
            pass
    
    return stale_connections  # 호출자가 DynamoDB에서 삭제 처리


def lambda_handler(event, context):
    route_key = event["requestContext"]["routeKey"]
    connection_id = event["requestContext"]["connectionId"]
    domain_name = event["requestContext"]["domainName"]
    stage = event["requestContext"]["stage"]
    
    dynamodb = boto3.resource("dynamodb")
    table = dynamodb.Table("WebSocketConnections")
    
    if route_key == "$connect":
        # 연결 수립 시 DynamoDB에 저장
        # TTL: 2시간 후 자동 만료 (DynamoDB TTL로 정리)
        import time
        table.put_item(Item={
            "connectionId": connection_id,
            "connectedAt": int(time.time()),
            "ttl": int(time.time()) + 7200  # 2시간 TTL
        })
        return {"statusCode": 200}
    
    elif route_key == "$disconnect":
        table.delete_item(Key={"connectionId": connection_id})
        return {"statusCode": 200}
    
    elif route_key == "sendMessage":
        body = json.loads(event.get("body", "{}"))
        message = body.get("message", "")
        
        # 모든 연결 조회
        response = table.scan(ProjectionExpression="connectionId")
        all_connections = [item["connectionId"] for item in response["Items"]]
        
        # 브로드캐스트
        api_id = event["requestContext"]["apiId"]
        region = "ap-northeast-2"
        stale = broadcast_message(message, all_connections, stage, api_id, region)
        
        # 끊어진 연결 정리
        with table.batch_writer() as batch:
            for conn_id in stale:
                batch.delete_item(Key={"connectionId": conn_id})
        
        return {"statusCode": 200}
```

> 🔍 **더 깊이**: `GoneException`은 HTTP 410 Gone에 해당한다. RFC 7231은 410을 "리소스가 영구적으로 삭제되었고 복원될 가능성이 없음"을 의미로 정의한다. WebSocket connectionId는 연결이 끊어지면 재사용될 수 없으므로 410이 정확한 의미다. `GoneException`을 받은 즉시 해당 `connectionId`를 DynamoDB에서 삭제해야 한다 — 그렇지 않으면 매 브로드캐스트마다 불필요한 API 호출이 누적된다.

**연결 제한값** — 시험에서 구체적 숫자를 묻는다:

| 제한 | 값 |
|------|-----|
| 최대 연결 지속 시간 | 2시간 |
| Idle Timeout (메시지 없을 시) | 10분 |
| 단일 프레임 최대 크기 | 128 KB |
| 프레임 누적 최대 크기 | 128 KB (연속 프레임은 별도 처리 필요) |

> 📚 **사례**: Slack은 WebSocket을 사용해 실시간 이벤트(메시지, 리액션, 사용자 상태 변경)를 클라이언트에 전달한다. 2019년 Slack Engineering 블로그에 따르면, 수백만 개의 동시 WebSocket 연결 관리가 핵심 인프라 과제 중 하나였다. AWS 기반에서 이를 구현한다면 API Gateway WebSocket + DynamoDB 연결 레지스트리 패턴이 표준이다. DynamoDB의 `TTL`로 비정상 종료된 stale 연결을 자동 정리하는 것이 필수다.

---

## DynamoDB를 이용한 연결 레지스트리 패턴

WebSocket 연결 관리의 핵심 패턴은 DynamoDB를 연결 레지스트리로 사용하는 것이다. 채팅룸 시나리오를 예로 들면:

```
DynamoDB 테이블: WebSocketConnections
────────────────────────────────────────
connectionId (PK) | roomId (GSI PK) | userId | connectedAt | ttl
─────────────────────────────────────────────────────────────────
conn_abc123       | room-001        | user-1 | 1703000000  | 1703007200
conn_def456       | room-001        | user-2 | 1703000100  | 1703007300
conn_ghi789       | room-002        | user-3 | 1703000200  | 1703007400

GSI: roomId-index (roomId → 해당 룸의 모든 연결 조회)
TTL: 연결 후 2시간, $disconnect로 먼저 삭제
```

특정 채팅룸에 메시지를 브로드캐스트할 때:
1. GSI로 `roomId = "room-001"` 쿼리 → `conn_abc123`, `conn_def456` 반환
2. 두 connectionId에 `post_to_connection` 호출
3. `GoneException` 받은 connectionId는 즉시 삭제

```python
def send_to_room(room_id: str, message: dict, apigw_client, table):
    """특정 채팅룸의 모든 연결에 메시지 전송"""
    # GSI 쿼리로 해당 룸의 연결만 조회 (Scan 대신 Query → 효율적)
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

> ⚠️ **함정**: `table.scan()`을 사용해 전체 연결을 조회하면 연결 수가 증가할수록 비용과 시간이 선형으로 늘어난다. 채팅룸처럼 범위 조회가 필요하면 반드시 GSI를 설계해야 한다. Scan은 전체 브로드캐스트(공지 알림 등)에만 적합하다.

---

## HTTP API: REST API와의 내부 차이를 이해하는 법

HTTP API는 2019년 re:Invent에서 "API Gateway v2"로 발표됐다. REST API(v1)의 많은 기능을 제거하는 대신 속도와 비용을 크게 개선했다. 단순히 "REST API의 저가형"이 아니라 다른 사용 사례를 위한 별도 제품이다.

**페이로드 버전(Payload Format Version)**은 HTTP API에서 가장 중요한 함정이다. REST API를 HTTP API로 마이그레이션할 때 80% 이상의 문제가 여기서 발생한다.

```python
# REST API Lambda Proxy 이벤트 구조 (= HTTP API Payload v1.0)
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

# HTTP API Payload v2.0 (기본값, 더 간결)
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

주요 차이:
- v2.0에는 `resource`, `path`, `httpMethod` 필드가 없다
- v2.0에는 `routeKey` 필드가 있다
- v2.0에서 `requestContext.identity` 대신 `requestContext.http`를 사용한다
- v2.0에서 헤더 이름이 소문자로 정규화된다

기존 REST API Lambda를 HTTP API v2.0에 붙이면 `event["httpMethod"]` 같은 코드가 `KeyError`를 일으킨다. 마이그레이션 시 `payload_format_version: "1.0"`으로 설정하거나 Lambda 코드를 수정해야 한다.

**HTTP API vs REST API 완전 비교**:

| 기능 | REST API | HTTP API | WebSocket API |
|------|----------|----------|---------------|
| Lambda Proxy 통합 | ✅ | ✅ | ✅ |
| Lambda Non-Proxy (VTL) | ✅ | ❌ | ❌ |
| HTTP 통합 | ✅ | ✅ | ❌ |
| AWS Service 직접 통합 | ✅ | ❌ | ❌ |
| MOCK 통합 | ✅ | ❌ | ❌ |
| IAM 인증 | ✅ | ✅ | ✅ |
| Lambda Authorizer | ✅ | ✅ | ✅ |
| Cognito User Pool Authorizer | ✅ | ❌ | ❌ |
| JWT Authorizer (OIDC) | ❌ | ✅ | ❌ |
| API Key + Usage Plan | ✅ | ❌ | ❌ |
| Resource Policy | ✅ | ❌ | ❌ |
| mTLS | ✅ | ✅ | ❌ |
| WAF | ✅ | ❌(CF 경유) | ❌ |
| Response Caching | ✅ | ❌ | ❌ |
| Request Validation | ✅ | ❌ | ❌ |
| Gateway Response 커스터마이즈 | ✅ | ❌ | ❌ |
| X-Ray Tracing | ✅ | ❌ | ❌ |
| Canary Deployment | ✅ | ❌ | ❌ |
| VPC Link (Private 통합) | NLB만 | ALB/NLB/CloudMap | ❌ |
| 비용 (100만 호출) | ~$3.50 | ~$1.00 | 연결 시간·메시지 수 |
| CORS 자동 설정 | ❌(수동) | ✅ | N/A |

> 🔍 **더 깊이**: HTTP API가 REST API보다 빠른 이유는 처리 파이프라인이 단순하기 때문이다. REST API는 VTL 매핑, 요청 검증, 사용량 플랜 평가, 캐시 조회 등 많은 미들웨어 레이어를 통과한다. HTTP API는 이 레이어들을 제거해 지연 시간을 줄이고 비용을 낮췄다. 이는 소프트웨어 설계의 "선택적 복잡도(accidental complexity)" 제거 원칙과 일치한다 — 필요하지 않은 기능의 오버헤드를 지불하지 않는다.

---

## HTTP API JWT Authorizer: 코드 없는 OIDC 검증

HTTP API는 OIDC(OpenID Connect) 표준을 따르는 JWT Authorizer를 네이티브로 지원한다. Lambda 코드 없이 JSON 설정만으로 Cognito, Auth0, Okta 등의 JWT를 검증할 수 있다.

```yaml
# SAM 템플릿으로 HTTP API + JWT Authorizer
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
            # 이 라우트는 DefaultAuthorizer 적용 (JWT 검증 필수)
            
        HealthCheck:
          Type: HttpApi
          Properties:
            ApiId: !Ref MyHttpApi
            Path: /health
            Method: GET
            Auth:
              Authorizer: NONE  # 이 라우트만 인증 제외
```

JWT Authorizer의 검증 흐름:
1. 클라이언트의 `Authorization` 헤더에서 Bearer 토큰 추출
2. JWT의 `iss`(issuer) 클레임이 설정된 issuer URL과 일치하는지 확인
3. issuer의 JWKS 엔드포인트에서 공개 키 조회(캐시됨)
4. JWT 서명 검증
5. JWT의 `aud`(audience) 클레임이 설정된 audience 목록에 포함되는지 확인
6. JWT 만료(`exp`) 확인
7. 모두 통과 → 백엔드 통합 호출

> ⚠️ **함정**: Cognito에서 Access Token과 ID Token은 다르다. JWT Authorizer의 `audience` 설정이 Access Token을 검증하도록 되어 있는데 ID Token을 보내면 `aud` 클레임이 일치하지 않아 401이 반환된다. Cognito Access Token의 `aud`는 클라이언트 ID가 아니라 `"token_use": "access"` 값이 다르게 처리된다. REST API의 Cognito User Pool Authorizer는 Access Token을 처리하도록 설계되어 있지만 HTTP API JWT Authorizer는 ID Token을 기본으로 한다.

---

## VPC Link: 프라이빗 서브넷 백엔드를 API Gateway에 연결

VPC Link는 API Gateway가 인터넷을 거치지 않고 VPC 내부 리소스(EC2, ECS, ALB, NLB)를 직접 호출하는 프라이빗 통합 메커니즘이다.

```
인터넷 → API Gateway → VPC Link → Private Subnet
                                        └── ALB → ECS Fargate
                                        └── NLB → EC2
                                        └── Cloud Map (HTTP API만)
```

REST API와 HTTP API의 VPC Link 지원 차이:

| | REST API VPC Link | HTTP API VPC Link |
|---|---|---|
| 지원 백엔드 | NLB만 | ALB, NLB, Cloud Map |
| 생성 시간 | ~20분 | ~20분 |
| 동일 계정만 | ✅ | ✅ |
| 교차 계정 | ❌ | ❌ |

```bash
# HTTP API VPC Link 생성 및 통합 설정
# 1. VPC Link 생성
VPC_LINK_ID=$(aws apigatewayv2 create-vpc-link \
  --name "MyVpcLink" \
  --subnet-ids subnet-abc123 subnet-def456 \
  --security-group-ids sg-xyz789 \
  --query 'VpcLinkId' --output text)

# 2. HTTP API Integration에서 VPC Link 사용
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

## Server-Sent Events vs WebSocket: 실시간 통신 방식 선택

실시간 기능이 필요할 때 WebSocket이 항상 정답은 아니다. 트래픽 방향과 복잡도에 따라 SSE(Server-Sent Events)가 더 적합할 수 있다.

| 항목 | WebSocket | SSE | Long Polling |
|------|-----------|-----|-------------|
| 통신 방향 | 양방향 | 서버 → 클라이언트만 | 서버 → 클라이언트 |
| 프로토콜 | ws:// / wss:// | HTTP | HTTP |
| 브라우저 지원 | ✅ | ✅(IE 제외) | ✅ |
| 자동 재연결 | 직접 구현 | ✅(브라우저 내장) | 직접 구현 |
| 방화벽 친화성 | 낮음(비표준 포트) | 높음(HTTP) | 높음 |
| AWS 구현 | WebSocket API | Lambda Response Streaming + Function URL | REST API |
| 적합한 사용 사례 | 채팅, 게임, 협업 도구 | AI 응답 스트리밍, 알림 | 단순 폴링 |

> 💡 **관련 이론**: SSE는 HTTP/1.1의 `text/event-stream` Content-Type을 사용한 청크 전송(chunked transfer encoding)으로 구현된다. HTTP 연결이 열린 채로 서버가 데이터를 스트리밍한다. Lambda의 Response Streaming과 조합하면 LLM API 응답처럼 긴 텍스트를 점진적으로 클라이언트에 전달할 수 있다. Lambda Function URL은 SSE 패턴을 직접 지원하지만 API Gateway WebSocket은 지원하지 않는다.

---

## Lambda Function URL vs HTTP API: 언제 무엇을 쓸까

Lambda Function URL은 2022년 출시됐다. 별도의 API Gateway 없이 Lambda에 직접 HTTPS 엔드포인트를 부여하는 기능이다.

| 항목 | Lambda Function URL | HTTP API | REST API |
|------|---------------------|----------|----------|
| 비용 | Lambda 요금만 (엔드포인트 무료) | $1.00/100만 호출 | $3.50/100만 호출 |
| 커스텀 도메인 | ❌ (aws.lambda.url 형식) | ✅ | ✅ |
| 여러 라우트/함수 | ❌ (단일 함수만) | ✅ | ✅ |
| 인증 | NONE 또는 AWS_IAM | JWT/IAM/Lambda Authorizer | 모두 지원 |
| Response Streaming | ✅ | ❌ | ❌ |
| CORS | 설정 가능 | 자동 | 수동 |
| 스로틀링 | Lambda 동시성 한도만 | API GW 스로틀링 + Lambda | API GW + Lambda |
| WAF | ❌ | ❌ | ✅ |

**선택 가이드라인**:
- 단일 함수를 빠르게 HTTPS로 노출, 비용 최소화 → **Function URL**
- 여러 Lambda를 라우팅, Cognito/Auth0 JWT 인증, CORS 자동화 → **HTTP API**
- API 키 + 사용량 플랜, VTL 변환, 캐싱, WAF, X-Ray → **REST API**
- 채팅/실시간 양방향 통신 → **WebSocket API**

> 📚 **사례**: Vercel의 Edge Functions, Cloudflare Workers와 같은 서비스는 Function URL과 유사한 "단일 함수 즉시 노출" 패턴을 제공한다. 이 패턴은 2020년 JAMstack 아키텍처의 부상과 함께 인기를 얻었다. AWS에서 Next.js를 서버리스로 배포할 때 각 API Route를 별도 Lambda로 배포하고 Function URL로 노출하는 방식이 일부 사용되지만, 복잡한 프로덕션 환경에서는 API Gateway HTTP API를 앞에 두는 것이 일반적이다.

---

## 📝 연습 문제

**문제 1.**  
WebSocket API에서 클라이언트가 연결을 수립할 때 실행되는 라우트는 `$connect`다. Lambda 함수가 `statusCode: 403`을 반환하면 어떻게 되는가?

A) 연결이 수립되고 이후 메시지는 정상 처리된다  
B) 연결이 거부되고 클라이언트는 연결할 수 없다  
C) `$default` 라우트로 폴백된다  
D) 연결이 수립되지만 `$disconnect`가 즉시 호출된다

**정답: B**  
`$connect` Lambda가 4XX 또는 5XX를 반환하면 WebSocket 핸드셰이크가 거부된다. 연결 자체가 수립되지 않는다. 이를 이용해 `$connect`에서 인증 로직을 구현할 수 있다 — JWT 토큰을 쿼리 파라미터로 받아 검증하고 유효하지 않으면 403을 반환하는 방식이다.

---

**문제 2.**  
실시간 채팅 애플리케이션에서 서버의 Lambda가 브로드캐스트를 시도했는데 일부 클라이언트에게 `GoneException`이 발생했다. 올바른 처리 방법은?

A) 잠시 후 동일한 connectionId로 재시도한다  
B) 해당 connectionId를 DynamoDB에서 즉시 삭제한다  
C) `$disconnect` 라우트를 수동으로 트리거한다  
D) API Gateway에 connectionId 갱신을 요청한다

**정답: B**  
`GoneException`(HTTP 410)은 해당 connectionId의 WebSocket 연결이 영구적으로 끊어졌음을 의미한다. connectionId는 재사용되지 않으므로 재시도는 의미가 없다. 즉시 DynamoDB에서 해당 connectionId를 삭제해 이후 브로드캐스트에서 불필요한 API 호출이 발생하지 않도록 해야 한다.

---

**문제 3.**  
기존 REST API Lambda 함수를 HTTP API로 마이그레이션했더니 `KeyError: 'httpMethod'`가 발생했다. 원인과 해결책은?

A) HTTP API는 GET 메서드를 지원하지 않는다. REST API를 유지한다  
B) HTTP API Payload v2.0이 기본값이며 이벤트 구조가 다르다. payload_format_version을 "1.0"으로 설정하거나 Lambda 코드를 수정한다  
C) IAM 권한 문제다. Lambda 실행 역할에 권한을 추가한다  
D) HTTP API는 Lambda Proxy 통합을 지원하지 않는다

**정답: B**  
HTTP API는 기본적으로 Payload Format Version 2.0을 사용한다. v2.0은 `httpMethod` 대신 `requestContext.http.method`를 사용하고, `routeKey` 등 새로운 필드를 포함한다. 통합 설정에서 `payloadFormatVersion: "1.0"`으로 변경하면 기존 REST API 이벤트 구조와 동일해진다.

---

**문제 4.**  
회사가 Auth0 JWT 토큰으로 API 인증을 구현하려 한다. Lambda Authorizer 코드 없이 가장 간단하게 구현하는 방법은?

A) REST API에 Cognito User Pool Authorizer를 설정하고 Auth0를 Cognito 대신 사용한다  
B) HTTP API에 JWT Authorizer를 설정하고 Auth0의 issuer URL과 audience를 지정한다  
C) REST API에 Resource Policy로 Auth0 IP를 허용한다  
D) Lambda Authorizer 없이는 외부 JWT 검증이 불가능하다

**정답: B**  
HTTP API의 JWT Authorizer는 OIDC 표준을 따르는 모든 공급자를 지원한다. Auth0의 경우 `issuer: "https://{your-domain}.auth0.com/"`, `audience: ["{your-api-identifier}"]`를 지정하면 Lambda 코드 없이 JWT 검증이 가능하다. REST API의 Cognito User Pool Authorizer는 Cognito만 지원한다.

---

**문제 5.**  
실시간 주식 가격을 서버에서 클라이언트에게 지속적으로 스트리밍해야 한다. 클라이언트는 데이터를 받기만 하고 서버에 데이터를 보낼 필요가 없다. 가장 단순한 AWS 구현은?

A) WebSocket API + DynamoDB 연결 관리  
B) REST API 롱 폴링  
C) Lambda Response Streaming + Function URL (SSE 패턴)  
D) SQS + 클라이언트 폴링

**정답: C**  
서버 → 클라이언트 단방향 스트리밍에는 SSE 패턴이 WebSocket보다 단순하다. Lambda의 Response Streaming을 활용하면 Function URL과 조합해 `text/event-stream` 형식으로 실시간 데이터를 스트리밍할 수 있다. WebSocket은 양방향 통신이 필요한 경우에 사용하고, DynamoDB 연결 레지스트리 관리 등 추가 복잡도가 따른다.

---

**문제 6.**  
API Gateway HTTP API가 REST API보다 비용이 낮은 이유는?

A) HTTP API는 Lambda를 사용하지 않아서 Lambda 비용이 없다  
B) HTTP API는 VTL 변환, 캐싱, 사용량 플랜 평가 등 많은 미들웨어 레이어를 제거해 처리 오버헤드가 적다  
C) HTTP API는 CloudFront를 통해 캐싱해서 실제 API 호출 수가 적다  
D) HTTP API는 샘플링을 통해 일부 요청만 처리한다

**정답: B**  
HTTP API의 낮은 비용과 낮은 지연 시간은 단순화된 처리 파이프라인에서 기인한다. REST API가 지원하는 VTL 매핑, 응답 캐싱, 사용량 플랜 평가, Gateway Response 커스터마이즈, X-Ray 통합 등의 미들웨어 레이어를 HTTP API는 포함하지 않는다. 기능을 줄여 속도와 비용을 개선한 트레이드오프다.

---

**문제 7.**  
WebSocket API의 Idle Timeout과 Maximum Connection Duration은 각각 얼마인가? 그리고 이 한도를 초과한 연결은 어떻게 되는가?

A) Idle Timeout 5분, Max Duration 1시간 → 자동 재연결  
B) Idle Timeout 10분, Max Duration 2시간 → 연결 강제 종료 후 $disconnect 라우트 실행  
C) Idle Timeout 30분, Max Duration 24시간 → 연결이 유지된다  
D) Idle Timeout 10분, Max Duration 2시간 → 연결 강제 종료, $disconnect 실행 보장 안됨

**정답: D**  
Idle Timeout은 10분(메시지나 Ping이 없을 때), Maximum Connection Duration은 2시간이다. 이 한도 초과 시 연결이 강제 종료되며, `$disconnect` 라우트 실행이 **보장되지 않는다**. 따라서 DynamoDB TTL을 연결 최대 시간에 맞춰 설정해 비정상 종료된 stale 연결을 자동 정리해야 한다.
