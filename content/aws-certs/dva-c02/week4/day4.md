# Day 19 - API Gateway: WebSocket API, HTTP API

📅 날짜: 2026년 6월 10일 (수요일)  
🎯 주제: WebSocket API 및 HTTP API  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- WebSocket API를 이용한 실시간 양방향 통신을 이해한다
- HTTP API와 REST API의 차이점을 비교한다
- WebSocket 연결 라우팅과 메시지 처리를 구현한다

---

## 📖 이론 내용

### 1. WebSocket API

WebSocket은 클라이언트와 서버 간의 지속적인 양방향 연결을 제공합니다.

**WebSocket vs REST:**
| 특성 | REST API | WebSocket API |
|------|----------|---------------|
| 연결 | 요청마다 새 연결 | 지속적 연결 |
| 방향 | 단방향 (요청-응답) | 양방향 |
| 사용 사례 | 일반 API | 실시간 채팅, 알림 |
| 효율성 | 낮음 (헤더 반복) | 높음 |

**WebSocket 라우트 키:**
- `$connect`: 연결 시 실행
- `$disconnect`: 연결 해제 시 실행
- `$default`: 매칭되지 않는 모든 메시지
- 사용자 정의: 특정 액션 처리

```python
# WebSocket Lambda 핸들러 예시
import json
import boto3

# API Gateway Management API 클라이언트
apigw = boto3.client('apigatewaymanagementapi',
    endpoint_url='https://abc123.execute-api.ap-northeast-2.amazonaws.com/prod')

def lambda_handler(event, context):
    route_key = event['requestContext']['routeKey']
    connection_id = event['requestContext']['connectionId']
    
    if route_key == '$connect':
        # 연결 ID를 DynamoDB에 저장
        save_connection(connection_id)
        return {'statusCode': 200}
    
    elif route_key == '$disconnect':
        # 연결 ID 삭제
        remove_connection(connection_id)
        return {'statusCode': 200}
    
    elif route_key == 'sendMessage':
        body = json.loads(event.get('body', '{}'))
        message = body.get('message', '')
        
        # 모든 연결된 클라이언트에게 브로드캐스트
        for conn_id in get_all_connections():
            try:
                apigw.post_to_connection(
                    ConnectionId=conn_id,
                    Data=json.dumps({'message': message}).encode()
                )
            except apigw.exceptions.GoneException:
                # 연결이 끊어진 경우
                remove_connection(conn_id)
        
        return {'statusCode': 200}
```

**서버에서 클라이언트로 메시지 전송:**
```python
# WebSocket 콜백 URL 형식:
# https://{api-id}.execute-api.{region}.amazonaws.com/{stage}/@connections/{connectionId}

endpoint = f"https://{api_id}.execute-api.{region}.amazonaws.com/{stage}"
client = boto3.client('apigatewaymanagementapi', endpoint_url=endpoint)

client.post_to_connection(
    ConnectionId=connection_id,
    Data=b'{"message": "서버에서 보낸 메시지"}'
)
```

### 2. HTTP API vs REST API

**HTTP API 장점:**
- REST API보다 **70% 저렴**
- 지연 시간 더 낮음
- CORS 자동 설정 지원
- JWT 자동 검증 지원 (Cognito, Auth0 등)

**HTTP API 제한:**
- API 키, 사용량 플랜 미지원
- X-Ray 트레이싱 미지원
- 리소스 정책 미지원
- 요청/응답 변환 제한적
- 캐싱 미지원

**언제 무엇을 사용할까:**
- **HTTP API**: 단순한 Lambda/HTTP 프록시, 저비용이 중요할 때
- **REST API**: 복잡한 기능(사용량 플랜, 캐싱, 변환) 필요 시

---

## 🧠 알아두면 좋은 심화 이론

### WebSocket 핵심 동작 (시험 시나리오 자주 출제)

```
연결 단계:
1. 클라이언트가 wss://xxx.execute-api.region.amazonaws.com/stage 에 연결
2. API GW가 connectionId 생성
3. $connect 라우트 → Lambda → 200이면 연결 완료, 4XX/5XX면 거부

메시지 단계:
4. 클라이언트가 JSON 메시지 송신 → routeSelectionExpression으로 라우팅
5. 매칭되는 라우트의 Lambda 실행
6. 응답을 보내려면 ApiGatewayManagementApi.post_to_connection() 호출

해제 단계:
7. 클라이언트가 끊거나 idle timeout(10분 기본)
8. $disconnect 라우트 → Lambda → 정리 작업
```

### Route Selection Expression - 메시지 라우팅 (시험 가끔)

```json
// 클라이언트 메시지
{ "action": "sendMessage", "data": "hi" }

// API GW 설정
routeSelectionExpression: "$request.body.action"
// → "sendMessage" 라우트로 라우팅
```

### WebSocket Connection 한도

- 클라이언트당 연결 시간 최대 **2시간**
- Idle timeout: **10분** (메시지/Ping 없을 시 끊김)
- 단일 메시지 최대 **128KB**, 32KB 단위로 청크 분할
- 연결 수: 계정·리전당 적용

### HTTP API 페이로드 버전 (시험 함정)

| 버전 | 이벤트 형식 |
|------|------------|
| **1.0** | REST API와 동일 (Lambda Proxy 형식) |
| **2.0** (기본) | 더 간결, `version: "2.0"`, `routeKey` 등 신규 필드 |

> ⚠️ **함정**: 기존 REST API Lambda를 HTTP API에 그대로 붙이면 이벤트 구조 달라서 깨짐. 페이로드 버전 1.0 강제 또는 Lambda 코드 수정.

### HTTP API JWT Authorizer (네이티브 지원)

```yaml
Authorizer:
  Type: JWT
  IdentitySource: $request.header.Authorization
  IssuerUrl: https://cognito-idp.region.amazonaws.com/{userPoolId}
  Audience: [ "my-client-id" ]
```

Cognito·Auth0·Okta 등 OIDC 호환 IDP의 JWT를 코드 없이 자동 검증.

### Server-Sent Events vs WebSocket (실무 비교)

| 항목 | WebSocket | SSE (Server-Sent Events) |
|------|-----------|--------------------------|
| 방향 | 양방향 | 서버 → 클라이언트만 |
| 프로토콜 | ws://, wss:// | HTTP 표준 |
| AWS 지원 | WebSocket API | Lambda Response Streaming + Function URL |
| 사용 | 채팅, 게임 | LLM 응답 스트리밍, 알림 |

> 💡 실시간 알림만 필요(서버→클라이언트)면 SSE가 더 간단하고 저렴.

### HTTP API 통합 추가 - VPC Link로 사설 ALB

```
HTTP API → VPC Link → 사설 ALB / NLB / Cloud Map → ECS/Fargate/EC2 (사설 서브넷)
```

REST API는 NLB만, HTTP API는 ALB/NLB/Cloud Map 모두 지원.

### Connection 관리 패턴 (실무)

```
DynamoDB Connections 테이블
  connectionId (PK) | userId (GSI) | joinedAt
  
$connect:    INSERT
$disconnect: DELETE
broadcast:   query GSI by chatRoomId → post_to_connection each
```

- **TTL** 활성화로 끊긴 연결 자동 정리
- `GoneException`: 이미 끊긴 연결 → DDB에서 즉시 삭제

### Lambda Function URL vs API Gateway HTTP API

| 항목 | Function URL | HTTP API |
|------|--------------|----------|
| 비용 | 무료 (Lambda 요금만) | $1/100만 호출 |
| 도메인 | aws 제공 | 커스텀 도메인 가능 |
| 라우팅 | 단일 함수 | 여러 라우트 |
| Authorization | NONE / AWS_IAM | JWT / IAM / Lambda |
| Streaming | ✅ | ❌ |

> 시나리오: "단일 Lambda 단순 HTTPS 노출" → Function URL이 더 단순·저렴.

### 관련 서비스 Cross-Reference

- **DynamoDB TTL** → [Week 6 Day 4]
- **Cognito + JWT** → [Week 9 Day 3]
- **Lambda Response Streaming** → [Week 3 Day 1]
- **AppSync (GraphQL)** → 시험엔 거의 안 나오지만 실시간 GraphQL 대안

---

## 아키텍처 다이어그램

```
WebSocket 실시간 채팅 아키텍처
================================

[클라이언트 A]         [클라이언트 B]
    |                       |
    | ws://                 | ws://
    v                       v
[WebSocket API Gateway]
    |
    +--[$connect]--> [Lambda - 연결 관리]
    |                        |
    |               [DynamoDB - 연결 ID 저장]
    |                ConnectionId: conn_A
    |                ConnectionId: conn_B
    |
    +--[sendMessage]--> [Lambda - 메시지 처리]
    |                        |
    |               연결된 모든 ID 조회
    |                        |
    |               [API GW Management API]
    |               post_to_connection(conn_A)
    |               post_to_connection(conn_B)
    |
    +--[$disconnect]--> [Lambda - 연결 해제]

HTTP API vs REST API 비교
================================

                 HTTP API    REST API
비용:            더 낮음     높음
성능:            더 빠름     보통
API 키:          X           O
사용량 플랜:     X           O
캐싱:            X           O
요청 검증:       X           O
VTL 변환:        X           O
JWT 자동 검증:   O           X (Lambda 필요)
CORS 자동:       O           수동 설정
X-Ray:           X           O
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **WebSocket 라우트**: $connect, $disconnect, $default, 사용자 정의
2. ⭐ **서버→클라이언트 전송**: @connections/{connectionId} API 사용
3. ⭐ **HTTP API**: REST API보다 70% 저렴, 사용량 플랜/캐싱 미지원
4. ⭐ **연결 ID 저장**: $connect 시 DynamoDB에 저장, $disconnect 시 삭제
5. ⭐ **GoneException**: 이미 끊어진 연결에 메시지 전송 시 발생

---

## 📝 연습 문제

**문제 1.** WebSocket API에서 클라이언트가 처음 연결할 때 실행되는 라우트 키는?

A) $default  
B) $connect  
C) $disconnect  
D) $open  

**정답: B** - $connect 라우트는 클라이언트가 WebSocket 연결을 처음 수립할 때 Lambda 함수를 호출합니다.

---

**문제 2.** API Gateway WebSocket에서 서버가 클라이언트에게 메시지를 보내려면?

A) 클라이언트가 먼저 요청을 보내야 한다  
B) @connections/{connectionId} API를 사용하여 push 가능  
C) SNS 토픽을 통해 전달해야 한다  
D) WebSocket에서는 서버→클라이언트 전송이 불가능하다  

**정답: B** - API Gateway Management API의 @connections 엔드포인트를 사용하여 서버에서 특정 연결 ID의 클라이언트에게 메시지를 푸시할 수 있습니다.

---

**문제 3.** HTTP API를 사용해야 하는 적절한 상황은?

A) API 키와 사용량 플랜이 필요한 경우  
B) 요청/응답 변환이 필요한 경우  
C) 단순 Lambda 프록시가 필요하고 비용을 최소화해야 하는 경우  
D) X-Ray 트레이싱이 필요한 경우  

**정답: C** - HTTP API는 단순한 Lambda/HTTP 프록시에 적합하며 REST API보다 70% 저렴합니다.

---

**문제 4.** WebSocket 연결이 이미 끊어진 클라이언트에게 메시지 전송 시 발생하는 예외는?

A) ConnectionClosedException  
B) GoneException  
C) NotFoundException  
D) DisconnectedException  

**정답: B** - 이미 연결이 끊어진 ConnectionId로 메시지를 전송하면 GoneException이 발생합니다. 이 경우 DynamoDB에서 해당 연결 ID를 삭제해야 합니다.

---

**문제 5.** HTTP API와 REST API 모두 지원하는 기능은?

A) API 키  
B) 사용량 플랜  
C) Lambda 프록시 통합  
D) 응답 캐싱  

**정답: C** - Lambda 프록시 통합(AWS_PROXY)은 HTTP API와 REST API 모두 지원합니다.

---

## 📌 오늘의 요약

1. WebSocket API: 지속적 양방향 연결, $connect/$disconnect/$default 라우트로 관리
2. 연결 관리: $connect 시 DynamoDB에 연결 ID 저장, $disconnect 시 삭제
3. 서버→클라이언트: Management API의 @connections/{connectionId}로 푸시
4. HTTP API: REST API보다 70% 저렴, 단순 프록시에 적합 (사용량 플랜/캐싱 미지원)
5. 실시간 채팅, 게임, 협업 도구 등에 WebSocket API 활용
