# Day 27 - API Gateway: 클라이언트와 백엔드 사이의 중재자

인터넷에서 API를 직접 노출하면 어떤 일이 벌어지는지 생각해보자. 인증 없이 누구나 호출할 수 있고, 악의적인 클라이언트가 초당 수천 건을 보낼 수 있고, 여러 팀의 클라이언트가 각기 다른 버전의 API를 요구한다. API Gateway는 이 모든 교차 관심사(Cross-Cutting Concerns)를 백엔드 코드 밖에서 처리한다. 인증, 스로틀링, 캐싱, 버전 관리, 모니터링 — 이것들을 각 Lambda나 서버 코드에서 직접 구현하는 대신, API Gateway 레이어에서 선언적으로 설정한다.

API Gateway의 탄생 배경에는 마이크로서비스 아키텍처의 급속한 확산이 있었다. 단일 모노리식 애플리케이션을 수십 개의 서비스로 분해하면, 클라이언트가 각 서비스의 엔드포인트를 개별적으로 알아야 하고, 각 서비스가 자체 인증을 구현해야 한다. API Gateway는 이 분산된 복잡성을 단일 진입점으로 통합한다.

## 세 가지 API 타입 — 언제 무엇을 선택하는가

AWS API Gateway는 세 가지 다른 API 타입을 제공한다. 이 세 개는 단순히 기능 수준의 차이가 아니라 설계 철학과 내부 구조가 다르다.

### REST API

REST API는 API Gateway의 원조(2015년 출시)다. HTTP 메서드(GET/POST/PUT/DELETE/PATCH)와 리소스 경로를 조합해서 RESTful 인터페이스를 만든다. 가장 많은 기능을 제공하지만 가장 비싸다. 복잡한 엔터프라이즈 시나리오나 파트너 API 포털에 적합하다.

REST API에서만 가능한 기능들:
- **API Key + Usage Plan**: 파트너에게 키를 발급하고 요청 수/처리량 한도를 설정
- **응답 캐싱**: API 레벨에서 응답을 캐싱 (0.5GB~237GB)
- **요청/응답 변환(Mapping Templates)**: VTL(Velocity Template Language)로 요청/응답 형식 변환
- **AWS 서비스 직접 통합**: Lambda 없이 DynamoDB, Kinesis, SQS 등을 직접 호출
- **Private Endpoint**: Interface Endpoint를 통한 VPC 내부 전용 API
- **클라이언트 인증서 상호 TLS**: 상호 TLS(mTLS) 지원

### HTTP API

HTTP API는 2020년에 출시됐다. REST API보다 단순하고 빠르며 70% 저렴하다. 마이크로서비스 API와 Lambda 통합의 대부분을 커버한다. 새로운 API를 구축한다면 HTTP API를 기본으로 고려하고, 특별한 기능이 필요할 때만 REST API로 간다.

HTTP API에서만 가능한 기능:
- **JWT Authorizer**: Cognito 외의 OIDC Provider(Auth0, Okta, Firebase, 사내 SSO 등)와 통합

HTTP API에서 불가능한 기능:
- API Key + Usage Plan (REST만)
- 응답 캐싱 (REST만)
- 요청/응답 변환 (REST만)
- AWS 서비스 직접 통합 (REST만)
- mTLS (REST만)

### WebSocket API

HTTP가 아닌 WebSocket 프로토콜을 사용하는 영구 양방향 연결 API다. 클라이언트와 서버가 서로 실시간으로 메시지를 주고받는다. 채팅, 알림, 실시간 게임, 금융 시세 업데이트에 적합하다.

WebSocket API의 작동 방식:
- 클라이언트가 WebSocket 연결을 열면 `$connect` 라우트 실행 (연결 ID 할당)
- 클라이언트가 메시지를 보내면 `$default` 또는 커스텀 라우트 실행
- 클라이언트가 연결을 끊으면 `$disconnect` 라우트 실행
- 서버에서 클라이언트에게 직접 메시지를 보내려면 API GW의 콜백 URL 사용: `POST /@connections/{connectionId}`
- 연결 ID는 DynamoDB에 저장해서 특정 사용자에게 메시지를 전달하는 데 사용

```
REST API:     클라이언트 → 요청 → API GW → Lambda → 응답 → 클라이언트
              (요청-응답 사이클마다 새 HTTP 연결)

HTTP API:     REST보다 저렴(70%), 단순, JWT 지원. 동일한 요청-응답 사이클

WebSocket:    클라이언트 ←──────── 영구 연결 (connectionId) ──────────► API GW
                          ← 서버→클라 메시지 (Push, 콜백 URL 사용)
                          → 클라→서버 메시지 (라우트 기반)
```

| 항목 | REST API | HTTP API | WebSocket API |
|------|----------|----------|---------------|
| 비용 | 가장 비쌈 | REST의 약 30% | 연결 시간+메시지 수 |
| 기능 풍부도 | 가장 많음 | 단순, 핵심만 | 양방향 실시간 |
| API Key + Usage Plan | O | X | X |
| 응답 캐싱 | O | X | X |
| JWT Authorizer | Cognito만 (Lambda로 나머지) | O (모든 OIDC) | X |
| 요청/응답 변환 | O (VTL) | X | X |
| AWS 서비스 직접 통합 | O | X | X |
| VPC Link 지원 | NLB만 | NLB/ALB | X |
| mTLS | O | O | X |

> 💡 **API Gateway의 패턴 이론: Gateway 패턴과 Facade 패턴** — API Gateway의 역할은 소프트웨어 아키텍처에서 "Gateway" 또는 "Facade" 패턴과 일치한다. Gang of Four(GoF)의 디자인 패턴 중 Facade는 복잡한 서브시스템 앞에 단순화된 인터페이스를 제공한다. API Gateway는 여러 마이크로서비스(Lambda, ECS 서비스, EC2 앱)를 단일 진입점으로 통합하고, 인증/스로틀링/모니터링이라는 교차 관심사를 중앙에서 처리한다. Chris Richardson이 정의한 마이크로서비스 패턴에서 API Gateway는 "Backend for Frontend(BFF)" 패턴의 구현체이기도 하다 — 모바일 앱, 웹, 파트너용으로 각각 다른 BFF를 API Gateway 레벨에서 분리할 수 있다.

> 🔍 **HTTP API와 REST API의 성능 차이** — HTTP API가 REST API보다 빠른 이유는 내부 처리 경로(Pipeline)가 단순하기 때문이다. REST API는 Mapping Template 처리, 복잡한 요청 변환, AWS 서비스 직접 통합 등을 지원하기 위한 추가 처리 단계가 있다. HTTP API는 이 기능들을 제거한 대신 레이턴시를 수십 ms 줄였다. 일반적으로 REST API의 P50 응답 레이턴시가 5-10ms인 반면, HTTP API는 1-3ms 수준이다. 대규모 트래픽에서 이 차이가 누적 비용 절감과 응답 속도 차이로 나타난다.

## 인증과 인가 — 4가지 메커니즘

API Gateway는 백엔드 코드가 인증을 직접 처리하지 않아도 되도록 여러 인증 메커니즘을 제공한다.

**IAM 인증(SigV4)**: AWS 서비스끼리 또는 AWS SDK를 사용하는 내부 클라이언트 인증. 요청에 AWS Signature Version 4 서명이 포함된다. 가장 강력하지만 일반 웹/모바일 클라이언트에서 구현이 복잡하다. 서비스 간 통신(예: Lambda → API GW), 내부 운영 도구에 적합.

**Cognito User Pool**: AWS Cognito가 발급한 JWT 토큰으로 인증. 사용자가 Cognito에 로그인하면 ID 토큰/Access 토큰/Refresh 토큰을 받고, API 요청 시 Authorization 헤더에 토큰을 포함한다. API Gateway가 Cognito에서 토큰을 검증한다. 모바일/웹 앱의 표준 패턴.

**Lambda Authorizer**: 완전 커스텀 인증 로직. API Gateway가 모든 요청에 대해 Authorizer Lambda를 먼저 실행하고, Lambda가 IAM Policy를 반환하면 그 Policy에 따라 요청을 허용/거부한다. 자체 SSO 시스템, OAuth 외부 서비스, 레거시 인증 시스템과의 통합에 사용.

두 가지 타입:
- **Token-based**: Authorization 헤더의 JWT/OAuth 토큰을 검증 (결과를 캐싱 가능)
- **Request-based**: HTTP 요청의 헤더, 쿼리 파라미터, 스테이지 변수, 컨텍스트를 모두 사용 가능

**API Key + Usage Plan(REST API만)**: API 키를 발급하고 각 키에 대해 초당/월간 요청 한도를 설정. 파트너 API나 개발자 포털에서 사용. 보안 인증 용도보다는 **사용량 제어와 과금**이 목적.

**JWT Authorizer(HTTP API만)**: Cognito 외의 OIDC Provider를 지원. Auth0, Okta, Firebase 등의 토큰을 API Gateway 레벨에서 자동 검증. Lambda Authorizer 없이 JWT 검증을 선언적으로 설정.

| 인증 방식 | 적용 가능 | 목적 | 복잡도 |
|---------|---------|------|------|
| IAM SigV4 | REST/HTTP | 서비스 간 내부 통신 | 높음 (SDK 필요) |
| Cognito User Pool | REST | 웹/모바일 사용자 인증 | 중간 |
| Lambda Authorizer | REST/HTTP | 커스텀/레거시 인증 | 높음 (코드 작성) |
| API Key + Usage Plan | REST만 | 사용량 제어, 파트너 관리 | 낮음 |
| JWT Authorizer | HTTP만 | 외부 OIDC 인증 | 낮음 (선언적) |

> ⚠️ **API Key는 보안 인증 수단이 아니다** — "API Key는 보안 인증 수단이다" — 반은 맞고 반은 틀렸다. API Key는 요청자를 식별하고 사용량을 제한하는 목적이 크다. AWS 문서에서도 API Key를 인증(Authentication)이 아니라 사용량 관리(Usage Management) 수단으로 정의한다. API Key만으로는 완전한 보안이 안 된다 — 반드시 HTTPS 전송과 함께 사용해야 하고, 추가 인증(Cognito 또는 Lambda Authorizer)과 병행하는 것을 권장한다. 시험에서 "누가 API를 호출했는지 인증이 필요"하면 Cognito/Lambda Authorizer를, "월별 호출 한도 제한"이면 Usage Plan을 선택한다.

> 💡 **Lambda Authorizer 캐싱과 성능** — Lambda Authorizer는 모든 요청에 대해 실행되므로, 레이턴시와 비용이 추가된다. 이를 완화하기 위해 Lambda Authorizer 결과를 캐싱할 수 있다. 캐시 TTL을 설정하면 같은 토큰으로 온 요청은 TTL 기간 동안 Authorizer Lambda를 다시 호출하지 않는다. 캐시 키는 토큰 값 또는 요청 파라미터다. 보안 주의사항: TTL을 너무 길게 설정하면 토큰이 취소(revoke)되어도 캐시 기간 동안 접근이 허용될 수 있다. 민감한 리소스에는 짧은 TTL(30-60초)이 권장된다.

## 스테이지와 배포 — 환경 관리

API Gateway에서 배포 단위는 "스테이지(Stage)"다. dev, staging, prod처럼 여러 환경을 같은 API 내에서 관리할 수 있다. 각 스테이지는 독립적인 URL을 가진다.

```
https://abc123.execute-api.ap-northeast-2.amazonaws.com/dev/orders
https://abc123.execute-api.ap-northeast-2.amazonaws.com/prod/orders
```

**스테이지 변수(Stage Variables)**: 스테이지마다 다른 설정 값을 변수로 관리. Lambda 함수 이름, Lambda 함수 별칭(alias), ARN 등을 스테이지 변수로 동적으로 지정할 수 있다.

```json
// dev 스테이지: lambdaAlias = "dev"
// prod 스테이지: lambdaAlias = "prod"
// API 통합 URI:
// arn:aws:lambda:region:account:function:my-func:${stageVariables.lambdaAlias}
```

이렇게 하면 단일 API Gateway 설정으로 dev 환경은 Lambda dev 별칭을, prod는 Lambda prod 별칭을 자동으로 호출한다. 배포 파이프라인에서 스테이지 변수를 변경하는 것만으로 환경 전환이 가능하다.

**Canary Release**: 새 배포를 전체가 아닌 일부 트래픽(예: 5-10%)에만 먼저 적용해서 안정성을 검증한다. 문제가 없으면 전체로 Promote, 문제가 있으면 즉시 롤백. Blue-Green 배포의 점진적 버전이다.

> 🔍 **Canary Release와 Blue-Green의 차이** — Canary Release는 새 버전이 기존 버전과 동시에 운영되면서 일부 트래픽만 받는 패턴이다. 카나리아 새처럼 먼저 광산(프로덕션)에 투입해서 위험을 감지한다는 비유에서 이름이 왔다. API Gateway Canary Release는 같은 스테이지에서 % 기반으로 트래픽을 분배한다. Blue-Green 배포는 두 개의 독립된 환경(Blue=현재, Green=신규)을 완전히 분리해서 DNS 전환으로 한번에 교체한다. API Gateway에서 두 스테이지를 별도로 만들고 Route 53 가중치 라우팅으로 Blue-Green을 구현할 수도 있다.

## 캐싱 — DB 부하 없이 응답 속도 향상

REST API에서 응답 캐싱을 활성화하면 API Gateway가 응답을 TTL 동안 보관한다. 동일한 요청이 오면 백엔드를 호출하지 않고 캐시에서 응답한다. 비용 절감과 성능 향상이 동시에 가능하다.

캐시 키는 기본적으로 Method + Path다. 쿼리 파라미터나 헤더를 캐시 키에 포함할 수 있다. 예를 들어 `GET /products?category=electronics`와 `GET /products?category=books`는 다른 캐시 키를 가진다.

캐싱이 적합하지 않은 경우:
- 사용자마다 다른 응답이 필요한 경우 (캐시 키에 사용자 ID 포함 필요, 효과 제한적)
- 실시간 데이터가 필요한 경우 (재고, 잔액, 실시간 가격)
- POST/PUT/DELETE (변경 작업에는 캐싱 부적합)

캐시 무효화:
- 전체 캐시 flush: 콘솔/API에서 스테이지 캐시를 비운다
- 개별 요청: `Cache-Control: max-age=0` 헤더 (이 권한은 별도 설정 필요)

> 🔍 **API Gateway 캐싱의 내부 구조** — API Gateway 응답 캐싱은 내부적으로 Amazon ElastiCache를 기반으로 알려져 있다. 캐시 크기(0.5GB~237GB)에 따라 비용이 발생하며, 캐시 노드 유형에 따라 성능이 다르다. TTL은 기본 300초(5분)이고 0~3600초 범위에서 설정 가능하다. 캐시를 정적 API 응답(변경이 적은 상품 카탈로그, 설정 데이터)에 적용하면 Lambda 호출 횟수와 DynamoDB RCU를 크게 줄일 수 있다. 단, 캐시 크기 비용(시간당 과금)이 Lambda + DynamoDB 비용 절감보다 크면 오히려 불리하다. 트래픽이 충분히 많고 캐시 히트율이 높아야 효과적이다.

## Private API와 VPC Link — 내부 서비스 API

외부 인터넷에 노출하지 않고 VPC 내부에서만 사용하는 API가 필요할 때 Private API를 사용한다. Interface VPC Endpoint를 통해서만 접근 가능하다.

VPC Link는 API Gateway가 VPC 내부의 백엔드 서비스를 호출하는 연결이다. 인터넷을 거치지 않고 AWS 프라이빗 네트워크를 통해 VPC 안의 NLB(REST API), ALB 또는 NLB(HTTP API)를 통해 ECS, EC2, 자체 서버 등을 호출한다.

```
[REST API + VPC Link (NLB)]
Internet → API GW → VPC Link → NLB → ECS/EC2 (Private VPC)
인증/스로틀링은 API GW에서, 비즈니스 로직은 프라이빗 서비스에서

[HTTP API + VPC Link (ALB 또는 NLB)]
Internet → API GW (HTTP API) → VPC Link → ALB → ECS/EC2 (Private VPC)

[Private API (VPC 내부 전용)]
Lambda (same VPC) → Interface Endpoint → Private API GW → Lambda
EC2 (same VPC)    → Interface Endpoint → Private API GW → ECS
```

> 📚 **삼성 SmartThings API Gateway 사례** — 2022년 삼성전자 SmartThings 팀은 API Gateway 활용 사례를 AWS Summit에서 공유했다. 수억 개의 IoT 디바이스가 연결된 플랫폼에서 REST API는 파트너 관리용(API Key + Usage Plan), HTTP API는 디바이스-클라우드 통신용(저비용, JWT 인증), WebSocket API는 실시간 상태 업데이트용으로 세 가지를 목적에 따라 분리해서 사용했다. 각 API 타입의 특성을 정확히 활용한 이 분리로 전체 API 비용을 40% 절감했다고 발표했다. 이 사례는 "HTTP API를 기본으로 선택하고 필요할 때만 REST API"라는 설계 원칙의 실제 효과를 보여준다.

다른 클라우드와의 비교:

| 항목 | AWS API Gateway | GCP Cloud Endpoints / API Gateway | Azure API Management |
|------|----------------|-----------------------------------|---------------------|
| REST 관리형 | O (REST API) | O | O |
| HTTP 저렴 버전 | O (HTTP API) | O (Cloud Endpoints) | O (Consumption tier) |
| WebSocket | O | X (기본) | O (WebSocket Policy) |
| API Key + Quota | O (REST만) | O | O |
| 캐싱 | O (REST만) | O | O |
| VPC 백엔드 | VPC Link | O (Serverless VPC Access) | O (VNet integration) |
| 자체 도메인 | O | O | O |
| WAF 통합 | O (AWS WAF) | O | O |
| 비용 | 요청당 과금 | 요청당 과금 | 호출 수 + 용량 |

## CLI로 API Gateway 설정하기

```bash
# HTTP API 생성 (Lambda 통합, CORS 설정)
aws apigatewayv2 create-api \
  --name prod-http-api \
  --protocol-type HTTP \
  --cors-configuration \
    AllowOrigins="https://myapp.com",\
    AllowMethods="GET,POST,PUT,DELETE",\
    AllowHeaders="Authorization,Content-Type",\
    MaxAge=300

# Lambda 통합 추가 (Payload Format 2.0)
aws apigatewayv2 create-integration \
  --api-id abc123 \
  --integration-type AWS_PROXY \
  --integration-uri arn:aws:lambda:ap-northeast-2:111:function:my-func \
  --payload-format-version 2.0

# JWT Authorizer (Cognito 또는 외부 OIDC)
aws apigatewayv2 create-authorizer \
  --api-id abc123 \
  --name cognito-jwt-auth \
  --authorizer-type JWT \
  --identity-source '$request.header.Authorization' \
  --jwt-configuration \
    Audience=["client-id"],\
    Issuer=https://cognito-idp.ap-northeast-2.amazonaws.com/POOL_ID

# 라우트 생성 (JWT Authorizer 적용)
aws apigatewayv2 create-route \
  --api-id abc123 \
  --route-key "GET /orders" \
  --authorization-type JWT \
  --authorizer-id auth-id \
  --target integrations/integ-id

# 스테이지 생성 (Auto-Deploy + 스로틀링)
aws apigatewayv2 create-stage \
  --api-id abc123 \
  --stage-name prod \
  --auto-deploy \
  --default-route-settings \
    ThrottlingBurstLimit=1000,\
    ThrottlingRateLimit=100,\
    DetailedMetricsEnabled=true

# REST API - API Key 생성
aws apigateway create-api-key \
  --name "partner-acme" \
  --enabled

# REST API - Usage Plan 생성 (월 10000회, 초당 50)
aws apigateway create-usage-plan \
  --name "partner-plan" \
  --throttle BurstLimit=100,RateLimit=50 \
  --quota Limit=10000,Period=MONTH \
  --api-stages '[{"apiId":"rest-api-id","stage":"prod"}]'

# Usage Plan에 API Key 연결
aws apigateway create-usage-plan-key \
  --usage-plan-id plan-id \
  --key-id key-id \
  --key-type API_KEY

# REST API - Canary Release 설정 (10% 신규 배포)
aws apigateway update-stage \
  --rest-api-id rest-api-id \
  --stage-name prod \
  --patch-operations \
    '[{"op":"replace","path":"/canarySettings/percentTraffic","value":"10"}]'

# VPC Link 생성 (HTTP API → ALB/NLB)
aws apigatewayv2 create-vpc-link \
  --name prod-vpc-link \
  --subnet-ids subnet-private-a subnet-private-b \
  --security-group-ids sg-api-gw

# REST API - AWS Service 직접 통합 (DynamoDB PutItem)
aws apigateway put-integration \
  --rest-api-id rest-api-id \
  --resource-id resource-id \
  --http-method POST \
  --type AWS \
  --integration-http-method POST \
  --uri arn:aws:apigateway:ap-northeast-2:dynamodb:action/PutItem \
  --credentials arn:aws:iam::111:role/api-gw-dynamo-role
```

## 정리하며

API Gateway의 세 가지 타입(REST, HTTP, WebSocket)은 각각 다른 요구사항을 위해 만들어졌다. HTTP API가 비용 효율적인 기본 선택이고, 복잡한 변환/캐싱/API Key 관리가 필요할 때만 REST API로 간다. WebSocket은 실시간 양방향 통신이 필요할 때만.

인증은 Cognito JWT가 가장 흔하고, 커스텀 로직이 필요하면 Lambda Authorizer, 내부 AWS 서비스 간이면 IAM SigV4, 외부 OIDC Provider이면 HTTP API + JWT Authorizer를 쓴다.

시험에서 가장 자주 나오는 함정: "API Key + Usage Plan은 HTTP API에서 사용 가능하다" — 불가능하다. REST API에서만 된다. "실시간 채팅은 REST API로 구현 가능하다" — 기술적으로 가능하지만 WebSocket이 훨씬 효율적이고 적합하다.

내일은 여러 Lambda 함수와 서비스를 하나의 워크플로로 엮는 Step Functions, 그리고 GraphQL의 관리형 서비스인 AppSync를 다룬다.

---

## 📝 연습 문제

**문제 1.** 파트너사에 외부 API를 제공하면서 파트너마다 월별 10,000회 요청 한도와 초당 50 TPS 제한을 적용하고 싶다. 가장 적합한 API Gateway 구성은?

A) HTTP API + JWT Authorizer (파트너 JWT로 인증)
B) REST API + API Key + Usage Plan
C) WebSocket API + Lambda Authorizer
D) HTTP API + Lambda Authorizer (요청 수 직접 추적)

**정답: B**

해설: API Key + Usage Plan은 REST API에서만 지원되는 기능이다. Usage Plan에서 월별 쿼터(10,000회)와 스로틀링(50 TPS)을 설정하고, 파트너마다 API Key를 발급해서 연결한다. HTTP API에는 API Key + Usage Plan이 없으므로 A와 D는 이 요구사항을 충족할 수 없다. C는 WebSocket은 지속 연결용이고 REST API 패턴에 맞지 않는다.

---

**문제 2.** 모바일 앱이 Cognito 외에 회사 자체 OAuth 2.0 서버(사내 SSO)를 통해 발급한 JWT 토큰으로 API를 호출한다. 최소한의 구현으로 이 인증을 처리하려면?

A) REST API + Lambda Authorizer (토큰 검증 로직 직접 구현)
B) HTTP API + JWT Authorizer (OIDC Provider로 사내 SSO 설정)
C) REST API + Cognito User Pool Authorizer (Cognito로 통합 필요)
D) HTTP API + API Key (토큰 대신 키 발급)

**정답: B**

해설: HTTP API의 JWT Authorizer는 Cognito뿐만 아니라 모든 OIDC 호환 Provider를 지원한다. 사내 SSO 서버가 OIDC를 준수하면 Issuer URL과 Audience만 설정하면 된다. Lambda 코드 없이 선언적으로 JWT 검증이 가능하다. A도 가능하지만 Lambda Authorizer 코드 작성이 필요해서 "최소한의 구현"에 맞지 않는다. C는 사내 SSO를 Cognito로 교체해야 해서 큰 변경이 필요하다.

---

**문제 3.** API Gateway의 응답 캐싱을 활성화했다. `/products` 엔드포인트의 캐시 TTL은 5분이다. 재고가 변경됐는데 클라이언트가 캐시된 이전 데이터를 받고 있다. 즉각적인 캐시 무효화 방법은?

A) Lambda 함수에서 ElastiCache를 직접 업데이트한다
B) API Gateway 캐시를 콘솔/CLI에서 Flush하거나, 클라이언트가 Cache-Control: max-age=0 헤더를 포함한다
C) API Gateway 스테이지를 재배포한다
D) Lambda 함수를 재배포한다

**정답: B**

해설: API Gateway 응답 캐시를 무효화하는 방법은 두 가지다. ① 콘솔 또는 API에서 캐시를 전체 flush. ② 클라이언트가 `Cache-Control: max-age=0` 헤더를 포함해서 캐시 우회 요청(이 권한은 API Gateway에서 별도로 허용 설정 필요). A는 API Gateway 캐시는 ElastiCache API로 직접 접근할 수 없다. C와 D는 배포와 캐시 내용은 무관하다.

---

**문제 4.** 실시간 주식 시세를 서버에서 클라이언트에게 Push해야 하는 금융 앱을 구축한다. 클라이언트는 web browser이며, 클라이언트가 요청하지 않아도 서버가 먼저 데이터를 보낼 수 있어야 한다. 가장 적합한 API Gateway 타입은?

A) REST API (Polling 방식으로 클라이언트가 주기적으로 요청)
B) HTTP API (Server-Sent Events 지원)
C) WebSocket API (서버에서 클라이언트로 Push 가능)
D) REST API + CloudFront (엣지에서 캐싱)

**정답: C**

해설: WebSocket API는 서버가 클라이언트에게 먼저 메시지를 Push할 수 있는 양방향 영구 연결을 제공한다. 실시간 시세처럼 서버가 업데이트를 Push해야 하는 경우의 표준 해결책이다. 서버 측 Lambda는 콜백 URL(`@connections/{connectionId}`)을 통해 특정 클라이언트에게 메시지를 전송한다. A는 Polling 방식은 지연이 있고 서버 부하가 크다. B는 API Gateway HTTP API는 Server-Sent Events를 네이티브로 지원하지 않는다. D는 정적 콘텐츠 캐싱이고 실시간 Push와 무관하다.

---

**문제 5.** API Gateway REST API에서 Lambda 없이 DynamoDB에 직접 PUT 요청을 처리하고 싶다. 클라이언트가 보낸 JSON 형식과 DynamoDB API 형식이 달라서 변환이 필요하다. 어떤 기능을 사용해야 하는가?

A) HTTP API + Lambda Proxy 통합
B) REST API + AWS Service 통합 + Mapping Template(VTL)
C) REST API + HTTP Proxy 통합
D) HTTP API + AWS Service 직접 통합

**정답: B**

해설: REST API의 AWS Service 통합은 Lambda 없이 DynamoDB, SQS, Kinesis 등 AWS 서비스를 직접 호출할 수 있다. 요청/응답 변환은 VTL(Velocity Template Language) Mapping Template으로 처리한다. 클라이언트의 JSON을 DynamoDB PutItem API 형식으로 변환하는 것이 이 조합의 핵심 역할이다. HTTP API는 AWS Service 직접 통합과 Mapping Template을 지원하지 않으므로 A와 D는 불가능하다.

---

**문제 6.** 개발팀이 API의 새 버전을 배포하면서 기존 트래픽의 10%만 새 버전으로 라우팅해서 안정성을 검증하고 싶다. 문제가 없으면 100%로 전환한다. 어떻게 구현하는가?

A) 새 스테이지를 만들고 Route 53 Weighted Routing으로 10%를 신규 스테이지로 보낸다
B) API Gateway Canary Release를 활성화하고 Canary 가중치를 10%로 설정한다
C) Lambda 별칭(Alias)의 가중치를 10%로 설정한다
D) CloudFront 동작(Behavior)에서 10%를 신규 Origin으로 라우팅한다

**정답: B**

해설: API Gateway 스테이지에서 Canary Release를 활성화하면 신규 배포의 트래픽 비율을 직접 설정할 수 있다. 10%로 시작해서 점진적으로 늘리고, 문제가 없으면 Promote해서 100%로 전환한다. 문제가 생기면 즉시 롤백. A는 가능하지만 Route 53을 별도로 관리해야 하는 복잡성이 있다. C는 Lambda 별칭 가중치도 유사한 기능이지만 API Gateway Canary가 더 직접적이고 API 레벨 통계도 분리해서 볼 수 있다. D는 CloudFront는 이런 방식의 가중치 라우팅을 기본으로 제공하지 않는다.

---

**문제 7.** 마이크로서비스 아키텍처에서 내부 서비스들이 VPC 안의 NLB를 통해 ECS 컨테이너로 구현돼 있다. 외부 클라이언트가 이 서비스들에 접근하되, 인터넷 트래픽이 VPC 내부 네트워크를 직접 지나지 않아야 한다. 가장 적합한 구성은?

A) ECS 서비스에 퍼블릭 IP를 할당해서 직접 접근 허용
B) API Gateway + VPC Link를 사용해서 프라이빗 네트워크를 통해 NLB에 연결
C) ALB를 퍼블릭 서브넷에 배치하고 ECS와 연결
D) API Gateway에서 HTTP Proxy로 ECS 프라이빗 IP 직접 호출

**정답: B**

해설: VPC Link는 API Gateway가 인터넷을 거치지 않고 AWS 프라이빗 네트워크를 통해 VPC 안의 NLB에 연결하는 메커니즘이다. 외부 클라이언트는 API Gateway 엔드포인트에 접근하고, 실제 트래픽은 VPC Link를 통해 NLB → ECS로 전달된다. ECS 컨테이너는 프라이빗 서브넷에 유지된다. A는 보안 위험이 크다. C는 ALB 퍼블릭 배치는 가능하지만 API Gateway의 인증/스로틀링 등의 이점을 포기한다. D는 API Gateway는 프라이빗 IP를 직접 라우팅하지 않는다.

---
