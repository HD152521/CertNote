# Day 1 - API Gateway REST API: 요청이 백엔드에 도달하기까지의 전체 경로

Amazon API Gateway가 처음 등장한 2015년, 서버리스 API를 만드는 방법은 EC2에 Flask나 Express를 올리거나, Elastic Beanstalk를 쓰는 것이었다. API Gateway는 "Lambda 함수를 HTTP 엔드포인트로 노출하는 관리형 서비스"라는 역할로 시작했지만, 시간이 지나며 인증·캐싱·트래픽 제어·모니터링이 붙은 완전한 API 관리 플랫폼으로 성장했다.

오늘은 REST API의 내부 구조를 완전히 해부한다. 클라이언트가 HTTP 요청을 보내는 순간부터 Lambda가 호출되고 응답이 돌아오기까지, 그 경로의 모든 계층이 무엇을 하는지 이해하면 시험 문제의 70%가 자연스럽게 풀린다.

## API Gateway가 필요한 이유: Lambda Function URL과의 비교

Lambda에는 2022년부터 Function URL이 있다. API Gateway 없이도 Lambda 함수에 직접 HTTPS 엔드포인트를 붙일 수 있다. 그런데 왜 API Gateway를 쓰는가?

| 기능 | Function URL | API Gateway HTTP API | API Gateway REST API |
|------|-------------|---------------------|---------------------|
| 비용 | 무료 (Lambda 요금만) | $1/100만 호출 | $3.5/100만 호출 |
| 라우팅 | 단일 함수 | 경로별 다른 함수 | 경로별 다른 함수 |
| 인증 | NONE / AWS_IAM | JWT / Lambda / IAM | Lambda / Cognito / IAM |
| 캐싱 | ❌ | ❌ | ✅ |
| API 키·사용량 플랜 | ❌ | ❌ | ✅ |
| 요청 검증 | ❌ | ❌ | ✅ (JSON Schema 기반) |
| WAF 통합 | ❌ | ❌ | ✅ |
| VTL 변환 | ❌ | ❌ | ✅ |
| X-Ray | ❌ | ❌ | ✅ |
| Response Streaming | ✅ | ❌ | ❌ |
| WebSocket | ❌ | ❌ | 별도 WebSocket API |

**선택 기준**: 단일 Lambda + 단순 HTTP 노출 → Function URL. 복잡한 라우팅·인증·캐싱·사용량 제한 필요 → REST API. 비용이 민감하고 단순한 Lambda/HTTP 프록시 → HTTP API.

> 💡 **관련 이론**: API Gateway는 엔터프라이즈 통합 패턴(EIP, Gregor Hohpe 2003)의 **Message Router** + **Message Filter** + **API Gateway Pattern**(Sam Newman "Building Microservices" 2015)이 합쳐진 것이다. API Gateway 패턴은 마이크로서비스 아키텍처에서 외부 클라이언트가 수십 개의 서비스를 직접 알 필요 없이 하나의 진입점을 통해 접근하게 한다. Netflix의 Zuul, Kong, Nginx Plus, AWS API Gateway 모두 이 패턴의 구현체다.

## REST API의 계층 구조: 리소스, 메서드, 통합, 스테이지

REST API는 트리 구조다.

```
API (MyShopAPI)
  └── 리소스 /products
        ├── GET  → 통합(Lambda: ListProducts)
        │           ├── 통합 요청 (요청 변환)
        │           └── 통합 응답 (응답 변환)
        ├── POST → 통합(Lambda: CreateProduct)
        └── /products/{productId}
              ├── GET    → 통합(Lambda: GetProduct)
              ├── PUT    → 통합(Lambda: UpdateProduct)
              └── DELETE → 통합(Lambda: DeleteProduct)
```

**리소스(Resource)**: URL 경로. `{}` 중괄호로 경로 파라미터 선언.
**메서드(Method)**: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.
**통합(Integration)**: 메서드가 호출하는 백엔드. Lambda, HTTP, AWS 서비스, Mock.
**스테이지(Stage)**: 배포 환경. dev, staging, prod.
**배포(Deployment)**: API 변경사항의 스냅샷. 스테이지에 연결해야 반영됨.

> ⚠️ **함정**: API를 변경한 후 **반드시 배포를 생성하고 스테이지에 연결해야** 변경이 적용된다. 콘솔에서 "저장"만 하고 배포를 빠뜨리면 클라이언트는 여전히 이전 버전의 API를 보게 된다.

## 요청이 이동하는 경로: 6단계 완전 분석

```
클라이언트 요청 (HTTPS)
        │
        ▼
[1. 엔드포인트 수신]
   Edge-Optimized: CloudFront PoP에서 TLS termination
   Regional: 리전 API Gateway 직접
   Private: VPC Interface Endpoint 경유
        │
        ▼
[2. 메서드 요청 (Method Request)]
   - 인증 (IAM SigV4, Lambda Authorizer, Cognito)
   - 경로 파라미터, 헤더, 쿼리스트링 검증
   - 요청 모델(JSON Schema) 검증
   실패 시 → 400/401/403 즉시 반환
        │
        ▼
[3. 통합 요청 (Integration Request)]
   - VTL 매핑 템플릿으로 요청 변환
   - Lambda / HTTP 엔드포인트 / AWS 서비스 호출
        │
        ▼
[4. 백엔드 처리]
   - Lambda 실행
   - HTTP 엔드포인트 응답
   - DynamoDB 응답 등
        │
        ▼
[5. 통합 응답 (Integration Response)]
   - 백엔드 응답 → VTL 매핑 템플릿으로 변환
   - Lambda Proxy면 변환 없이 그대로
        │
        ▼
[6. 메서드 응답 (Method Response)]
   - HTTP 상태 코드, 헤더, 응답 모델 설정
   - 클라이언트에게 최종 응답 전달
```

이 6단계를 이해하면 API Gateway 트러블슈팅이 쉬워진다.
- 401/403이 나오면 → [2] 인증 계층 확인
- 400이 나오면 → [2] 요청 검증 실패 (파라미터 / 모델)
- 502 Bad Gateway → [4] 백엔드 오류 (Lambda 에러 or 포맷 문제)
- 504 Timeout → [4] 백엔드 타임아웃 (Lambda 30초 제한 초과)

## 세 가지 엔드포인트 유형과 선택 기준

**Edge-Optimized**: CloudFront의 600+ PoP에서 TLS를 종료하고 백본망으로 요청을 전달. 글로벌 사용자가 많은 공개 API에 적합. 단, 실제 CloudFront 콘솔에는 보이지 않는 AWS 관리형 CloudFront다. 커스텀 CloudFront 설정이 필요하면 Regional + 별도 CloudFront를 사용한다.

**Regional**: 동일 리전의 클라이언트가 직접 연결. EC2나 Lambda에서 같은 리전 API를 호출할 때 유리. 자체 CloudFront를 붙여 캐싱과 WAF를 추가할 수 있다.

**Private**: VPC 내부의 Interface Endpoint(PrivateLink)를 통해서만 접근 가능. 인터넷에서 절대 접근 불가. 사내 마이크로서비스 API, 데이터 파이프라인 API에 적합.

| 엔드포인트 | CloudFront | 커스텀 도메인 ACM 위치 | 사용 케이스 |
|-----------|-----------|---------------------|----------|
| Edge-Optimized | AWS 관리 | **us-east-1 필수** | 글로벌 공개 API |
| Regional | 선택(자체) | 각 리전 | 리전 내 서비스, 모바일 백엔드 |
| Private | 없음 | 각 리전 | VPC 내부 API |

> ⚠️ **함정**: Edge-Optimized 커스텀 도메인의 ACM 인증서는 **반드시 us-east-1**에서 발급해야 한다. 이는 CloudFront가 us-east-1 ACM만 참조하기 때문이다. "도메인이 동작하지 않아요"라는 시나리오에서 인증서를 us-east-1이 아닌 다른 리전에서 발급한 경우가 흔한 원인이다. Regional 엔드포인트는 각 리전의 ACM에서 발급해도 된다.

## 스테이지와 스테이지 변수: 환경별 라우팅

스테이지는 단순히 "dev/staging/prod"를 구분하는 것 이상이다. **스테이지 변수**를 통해 동일한 API 정의로 다른 백엔드에 라우팅할 수 있다.

```
API 통합 URI:
arn:aws:lambda:ap-northeast-2:123:function:OrderAPI:${stageVariables.lambdaAlias}

dev 스테이지:   lambdaAlias = dev  → OrderAPI:dev  (별칭)
prod 스테이지:  lambdaAlias = prod → OrderAPI:prod (별칭)
```

스테이지 변수 활용 패턴:
- Lambda 별칭 분기 (가장 흔함)
- HTTP 통합 URL 분기 (`${stageVariables.backendUrl}`)
- AWS 서비스 ARN 분기

```bash
# 스테이지 변수 설정
aws apigateway create-stage \
  --rest-api-id abc123 \
  --stage-name prod \
  --variables 'lambdaAlias=prod,backendUrl=https://api.mycompany.com'
```

> 🔍 **더 깊이**: 스테이지 변수는 API Gateway 레벨의 환경 변수다. Lambda 함수의 환경 변수와는 다른 계층이다. Lambda 환경 변수는 함수 실행 시 코드에 노출되고, 스테이지 변수는 API Gateway가 통합 URI를 구성할 때 치환된다. 두 개를 함께 쓰면 API Gateway → Lambda 통합에서 스테이지별 다른 함수를 호출하고, 각 함수 내부에서는 자체 환경 변수로 추가 설정을 관리하는 구조가 된다.

## REST API vs HTTP API vs WebSocket API: 핵심 비교표

| 항목 | REST API | HTTP API | WebSocket API |
|------|----------|----------|---------------|
| 비용 | $3.5/100만 | **$1/100만** | $1/100만 메시지 + 연결 시간 |
| 지연 시간 | 보통 | 낮음 | - |
| 통신 방향 | 요청-응답 | 요청-응답 | 양방향 |
| Lambda Proxy | ✅ | ✅ | 라우트별 |
| Lambda Authorizer | ✅ | ✅ | ✅ |
| JWT Authorizer | Lambda 사용 | **✅ 기본 지원** | ❌ |
| Cognito Authorizer | ✅ | JWT로 대체 | ❌ |
| IAM (SigV4) | ✅ | ✅ | ✅ |
| API 키·사용량 플랜 | ✅ | ❌ | ❌ |
| 응답 캐싱 | ✅ | ❌ | - |
| 요청 검증 (모델) | ✅ | ❌ | ❌ |
| VTL 매핑 템플릿 | ✅ | ❌ | ❌ |
| AWS 서비스 직접 통합 | ✅ | ❌ | ❌ |
| WAF 통합 | ✅ | CloudFront 필요 | ❌ |
| X-Ray 트레이싱 | ✅ | ❌ | ❌ |
| Edge-Optimized | ✅ | ❌ | ❌ |
| VPC Link (ALB) | NLB만 | ALB/NLB/Cloud Map | ❌ |
| CORS 자동 설정 | 수동 | ✅ | - |

**시험 시나리오 키워드 → 선택:**
- "API 키와 사용량 플랜으로 파트너별 차등 제한" → **REST API**
- "비용 최소화, 단순 Lambda 프록시" → **HTTP API**
- "WAF로 SQL 인젝션 방어" → **REST API**
- "JWT 자동 검증 (Cognito/Auth0/Okta)" → **HTTP API** (JWT Authorizer 내장)
- "실시간 채팅, 게임, 협업 도구" → **WebSocket API**
- "X-Ray 분산 추적" → **REST API**

## 커스텀 도메인: api.mycompany.com 설정

```
Route 53 A 레코드 (Alias)
api.mycompany.com → API Gateway Custom Domain
        │
        ▼
API Gateway Custom Domain Name
  + ACM 인증서 (HTTPS TLS)
        │
        ▼ Base Path Mapping
/v1 → REST API "MyAPI" stage "prod"
/v2 → REST API "MyAPI-v2" stage "prod"
/internal → REST API "InternalAPI" stage "prod"
```

```bash
# 커스텀 도메인 생성 (Regional 엔드포인트)
aws apigateway create-domain-name \
  --domain-name api.mycompany.com \
  --endpoint-configuration types=REGIONAL \
  --regional-certificate-arn arn:aws:acm:ap-northeast-2:123:certificate/abc

# Base Path Mapping (하나의 도메인으로 여러 API 라우팅)
aws apigateway create-base-path-mapping \
  --domain-name api.mycompany.com \
  --rest-api-id abc123 \
  --stage prod \
  --base-path v1
```

## REST API 내장 카나리 배포

Lambda 별칭의 카나리와는 별도로, REST API 스테이지 자체에 카나리를 활성화할 수 있다.

```bash
# 스테이지에 카나리 설정 (새 배포의 10%만 카나리로)
aws apigateway update-stage \
  --rest-api-id abc123 \
  --stage-name prod \
  --patch-operations \
    'op=replace,path=/canarySettings/percentTraffic,value=10' \
    'op=replace,path=/canarySettings/deploymentId,value=new-deploy-id'

# 카나리 승격 (100%로)
aws apigateway update-stage \
  --rest-api-id abc123 \
  --stage-name prod \
  --patch-operations 'op=replace,path=/canarySettings/percentTraffic,value=0'
```

> 💡 **관련 이론**: API Gateway의 카나리 배포는 Lambda 별칭의 트래픽 분할과 함께 사용하면 두 겹의 안전장치가 생긴다. API Gateway 카나리(배포 버전 수준)와 Lambda 별칭 카나리(함수 버전 수준)를 조합해 배포 위험을 최소화한다. 이는 Netflix의 "Chaos Engineering" 원칙과 일맥상통한다 — 통제된 위험으로 시스템의 견고성을 검증한다.

## OpenAPI(Swagger) Import/Export

API 정의를 코드로 관리하거나 팀 간에 공유할 때 OpenAPI 3.0 형식을 사용한다.

```yaml
# openapi.yaml
openapi: "3.0.1"
info:
  title: "ProductAPI"
  version: "1.0"

paths:
  /products:
    get:
      summary: "상품 목록 조회"
      x-amazon-apigateway-integration:
        type: aws_proxy
        httpMethod: POST
        uri: "arn:aws:apigateway:ap-northeast-2:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-2:123:function:ListProducts/invocations"
        payloadFormatVersion: "1.0"
      responses:
        "200":
          description: "성공"
```

```bash
# OpenAPI 정의로 API import
aws apigateway import-rest-api \
  --body file://openapi.yaml \
  --region ap-northeast-2

# 기존 API 업데이트 (merge 모드)
aws apigateway put-rest-api \
  --rest-api-id abc123 \
  --mode merge \
  --body file://openapi.yaml
```

## 가격 모델

| API 유형 | 첫 3억 호출 | 초과 |
|----------|------------|------|
| REST API | $3.50/100만 | $1.51/100만 |
| HTTP API | $1.00/100만 | $0.90/100만 |
| WebSocket | $1.00/100만 메시지 + $0.25/100만 연결-분 | - |
| 캐싱 | 0.5GB: $0.020/h ~ 237GB: $3.800/h | - |

데이터 전송: 첫 10TB/월은 $0.09/GB, 이후 단계별 할인.

> 📚 **사례**: Slack은 2019년 API Gateway HTTP API(출시 초기)를 도입해 웹훅 수신 비용을 크게 절감했다. 초당 수천 건의 짧은 웹훅 요청에서 REST API 대비 70% 절감이 검증됐다. 단, Slack의 내부 API 중 사용량 추적이 필요한 것들은 여전히 REST API를 사용한다 — API 키와 사용량 플랜이 HTTP API에 없기 때문이다.

## 마무리

API Gateway REST API는 HTTP 요청을 받아 인증하고, 검증하고, 변환하고, 백엔드를 호출하고, 응답을 변환해 돌려주는 6단계 파이프라인이다. 엔드포인트 유형은 트래픽 경로를 결정하고, 스테이지는 환경별 배포 단위이며, 스테이지 변수는 하나의 API 정의로 여러 환경에 유연하게 연결하는 메커니즘이다. REST, HTTP, WebSocket 세 가지 API 유형은 기능과 비용에서 명확한 트레이드오프가 있으며, 요구 사항에 맞게 선택하면 된다.

다음 글에서는 API Gateway 통합의 핵심인 Lambda Proxy 통합, VTL 매핑 템플릿, AWS 서비스 직접 통합을 파고든다.

---

## 📝 연습 문제

**문제 1.** API Gateway REST API에서 스테이지를 만들었지만 변경 사항이 클라이언트에 반영되지 않는다. 원인은?

A) 캐시를 비워야 한다  
B) Lambda 함수를 재배포해야 한다  
C) API 변경 후 새 배포(Deployment)를 생성하고 스테이지에 연결해야 한다  
D) CloudFront 캐시를 무효화해야 한다  

**정답: C**  
해설: API Gateway에서 API 정의(리소스, 메서드, 통합, 인증 등)를 변경한 후에는 반드시 배포(Deployment)를 생성하고 스테이지에 연결해야 변경사항이 적용된다. 콘솔에서 "저장"을 눌러도 배포하지 않으면 기존 API가 서비스된다. A는 캐시 문제가 아니다. B는 Lambda 재배포가 필요한 상황이 아니다. D는 CloudFront 캐시는 별도 설정이고 이 경우의 원인이 아니다.

---

**문제 2.** Edge-Optimized API Gateway에서 커스텀 도메인을 설정하려 할 때 ACM 인증서는 어디서 발급해야 하는가?

A) 사용 중인 리전 (예: ap-northeast-2)  
B) 반드시 us-east-1  
C) Route 53과 같은 리전  
D) 아무 리전에서나 발급 가능  

**정답: B**  
해설: Edge-Optimized 엔드포인트는 CloudFront를 사용하며, CloudFront는 us-east-1의 ACM 인증서만 참조할 수 있다. 따라서 Edge-Optimized 커스텀 도메인에 필요한 ACM 인증서는 반드시 us-east-1에서 발급해야 한다. Regional 엔드포인트는 각 리전의 ACM에서 발급된 인증서를 사용한다. 이것은 DVA 시험에서 "도메인이 동작하지 않음" 시나리오의 흔한 원인이다.

---

**문제 3.** 파트너 회사에 API를 제공하고 각 파트너별로 다른 호출 한도를 설정해야 한다. 어떤 API Gateway 기능을 사용해야 하는가?

A) Lambda Authorizer  
B) VPC Endpoint  
C) API 키 + 사용량 플랜(Usage Plan)  
D) Cognito 사용자 풀  

**정답: C**  
해설: API 키는 클라이언트(파트너)를 식별하고, 사용량 플랜은 해당 키에 대해 초당 요청 수(RPS), 버스트, 월별 할당량 한도를 설정한다. 파트너 A에게는 1,000 RPS, 파트너 B에게는 100 RPS를 할당하는 식으로 차등 제한이 가능하다. A는 인증 용도이지 사용량 제한 용도가 아니다. B는 VPC 내부 접근용. D는 사용자 인증용이지 사용량 제한용이 아니다.

---

**문제 4.** WAF(Web Application Firewall)를 API Gateway에 직접 통합할 수 있는 API 유형은?

A) HTTP API만 지원  
B) WebSocket API만 지원  
C) REST API (Edge-Optimized 또는 Regional)  
D) 모든 API 유형이 WAF를 지원  

**정답: C**  
해설: AWS WAF는 API Gateway REST API(Edge-Optimized 및 Regional)에 직접 연결할 수 있다. HTTP API는 WAF를 직접 지원하지 않으며, WAF를 적용하려면 앞에 CloudFront를 배치하고 CloudFront에 WAF를 연결해야 한다. WebSocket API도 WAF 직접 통합을 지원하지 않는다.

---

**문제 5.** API Gateway 스테이지 변수의 사용 사례로 적절하지 않은 것은?

A) dev 스테이지에서는 Lambda 별칭 "dev", prod 스테이지에서는 "prod"를 호출  
B) 스테이지별로 다른 HTTP 백엔드 URL 참조  
C) Lambda 함수의 메모리 크기를 스테이지별로 다르게 설정  
D) AWS 서비스 통합에서 테이블 이름을 스테이지별로 다르게 지정  

**정답: C**  
해설: 스테이지 변수는 API Gateway에서 통합 URI, HTTP URL, ARN 등을 동적으로 참조할 때 사용한다. Lambda 함수의 메모리 크기는 Lambda 함수 자체의 설정이며 API Gateway 스테이지 변수로 제어할 수 없다. A, B, D는 모두 스테이지 변수의 적합한 사용 사례다.

---

**문제 6.** 한 팀이 REST API에서 HTTP API로 마이그레이션을 검토하고 있다. 마이그레이션이 불가능한 기능 요구사항은?

A) Lambda 프록시 통합  
B) IAM 인증 (SigV4)  
C) CloudWatch 메트릭 모니터링  
D) 응답 캐싱과 사용량 플랜  

**정답: D**  
해설: 응답 캐싱(Caching)과 사용량 플랜(Usage Plan)은 HTTP API에서 지원하지 않는다. HTTP API는 더 저렴하고 빠르지만, 이 두 기능이 필요하면 REST API를 유지해야 한다. A는 HTTP API도 Lambda 프록시 통합 지원. B는 HTTP API도 IAM 인증 지원. C는 HTTP API도 CloudWatch 메트릭 지원(단, 세부 메트릭 종류는 적음).

---

**문제 7.** API Gateway REST API의 엔드포인트 유형 중 VPC 내부에서만 접근 가능한 것은?

A) Edge-Optimized  
B) Regional  
C) Private  
D) Internal  

**정답: C**  
해설: Private 엔드포인트는 VPC 내부의 Interface Endpoint(PrivateLink)를 통해서만 접근 가능하며, 인터넷에서는 절대 접근할 수 없다. 이는 내부 마이크로서비스 API, 데이터 파이프라인 API, 회사 내부 도구 API에 적합하다. 리소스 정책으로 특정 VPC 또는 VPC Endpoint에서의 접근을 더 세밀하게 제어할 수 있다. D는 존재하지 않는 엔드포인트 유형이다.

