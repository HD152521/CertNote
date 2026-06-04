# Day 20 - Week 4 복습: API Gateway 종합 시나리오로 실전 감각 다지기

Week 4에서 다룬 API Gateway는 단순한 HTTP 프록시가 아니다. REST API, HTTP API, WebSocket API라는 세 가지 독립적인 제품군이 서로 다른 패러다임을 구현하며, 각각 다른 인증 방식, 통합 유형, 성능 특성을 가진다. 이번 복습에서는 개별 개념의 재확인보다 **경계 케이스와 선택 판단**에 집중한다. DVA-C02는 "어떤 서비스를 쓸까"보다 "왜 이 설정이 틀렸는가", "이 오류가 발생하는 근본 원인은 무엇인가"를 묻는다. 아래 시나리오 문제들은 실제 시험에서 출제되는 방식과 같은 복합 조건 형태로 구성했다.

---

## Week 4 전체 스펙 레퍼런스

### API Gateway 세 가지 유형 완전 비교

| 기능 | REST API | HTTP API | WebSocket API |
|------|----------|----------|---------------|
| **프로토콜** | HTTP/1.1 | HTTP/1.1 | RFC 6455 WebSocket |
| **통신 방향** | 요청-응답 | 요청-응답 | 양방향 |
| **비용(100만 호출)** | ~$3.50 | ~$1.00 | 연결 시간 + 메시지 수 |
| **Lambda Proxy 통합** | ✅ | ✅ | ✅ |
| **VTL 매핑 템플릿** | ✅ | ❌ | ❌ |
| **AWS Service 직접 통합** | ✅ | ❌ | ❌ |
| **MOCK 통합** | ✅ | ❌ | ❌ |
| **IAM 인증** | ✅ | ✅ | ✅ |
| **Lambda Authorizer** | ✅ | ✅ | ✅($connect만) |
| **Cognito User Pool Authorizer** | ✅ | ❌ | ❌ |
| **JWT Authorizer** | ❌ | ✅ | ❌ |
| **API Key + Usage Plan** | ✅ | ❌ | ❌ |
| **Resource Policy** | ✅ | ❌ | ❌ |
| **mTLS** | ✅ | ✅ | ❌ |
| **WAF** | ✅(직접) | ❌(CF 우회) | ❌ |
| **응답 캐싱** | ✅ | ❌ | ❌ |
| **Request Validation** | ✅ | ❌ | ❌ |
| **Gateway Response 커스터마이즈** | ✅ | ❌ | ❌ |
| **X-Ray Tracing** | ✅ | ❌ | ❌ |
| **Canary Deployment** | ✅ | ❌ | ❌ |
| **VPC Link 백엔드** | NLB만 | ALB/NLB/CloudMap | ❌ |
| **CORS 자동 설정** | ❌(수동) | ✅ | N/A |
| **Payload Format** | Lambda Proxy 형식 | v1.0 또는 v2.0(기본) | 별도 |

### 인증 방식 선택 매핑

| 시나리오 | 권장 인증 방식 |
|----------|---------------|
| AWS Lambda/EC2가 다른 계정 API 호출 | IAM + SigV4 |
| 외부 OAuth2 / 자체 JWT 검증 | Lambda Authorizer (TOKEN) |
| 헤더 + 쿼리 + 경로 복합 검증 | Lambda Authorizer (REQUEST) |
| Cognito User Pool 사용자 (REST API) | Cognito User Pool Authorizer |
| Cognito/Auth0/Okta JWT (HTTP API) | JWT Authorizer |
| 파트너 API 사용량 추적 + 할당량 | API Key + Usage Plan |
| VPC 내부에서만 접근 허용 | Resource Policy (SourceVpce) |
| IP 화이트리스트 | Resource Policy (SourceIp) |
| 교차 계정 API 접근 | Resource Policy (Principal ARN) |
| IoT 디바이스, B2B 파트너 인증 | mTLS |
| SQL 인젝션·XSS 방어 | WAF (REST API만 직접) |

### 통합 유형 선택 매핑

| 시나리오 | 통합 유형 |
|----------|----------|
| Lambda를 가장 단순하게 연결 | AWS_PROXY (Lambda Proxy) |
| Lambda 응답을 변환해서 클라이언트에 전달 | AWS (non-Proxy) + 응답 매핑 |
| DynamoDB/SNS/SQS 직접 호출 (Lambda 없이) | AWS (non-Proxy) + VTL |
| 외부 HTTP 서버 프록시 | HTTP_PROXY |
| 외부 HTTP 서버 + 응답 변환 | HTTP + 응답 매핑 |
| 개발/테스트용 하드코딩 응답 | MOCK |

### 주요 CloudWatch 메트릭 정리

| 메트릭 | 측정 대상 | 활용 |
|--------|----------|------|
| `Latency` | 클라이언트 수신 ~ 응답 반환 (전체) | 전체 성능 모니터링 |
| `IntegrationLatency` | API GW → 백엔드 호출 ~ 응답 | 백엔드 성능 분리 |
| `Count` | 총 API 호출 수 | 트래픽 추세 |
| `4XXError` | 400·401·403·429 등 클라이언트 오류 | 오용·인증 실패·스로틀링 탐지 |
| `5XXError` | 500·502·503·504 등 서버 오류 | 백엔드 장애·타임아웃 탐지 |
| `CacheHitCount` | 캐시에서 응답한 횟수 | 캐시 효율성 |
| `CacheMissCount` | 백엔드 호출이 필요했던 횟수 | 캐시 효율성 |

`Latency - IntegrationLatency`가 크면 API GW 내부 처리(인증·VTL·캐시 조회)가 병목. `IntegrationLatency` 자체가 크면 백엔드가 느린 것.

---

## Week 4 핵심 함정 목록

1. **배포(Deploy) 없으면 변경이 적용되지 않는다**: REST API에서 리소스, 메서드, 통합, Authorizer를 변경해도 스테이지에 재배포하지 않으면 반영되지 않는다. HTTP API는 자동 배포된다.

2. **API 키는 인증이 아니다**: `x-api-key` 헤더는 클라이언트 식별과 사용량 추적 목적이다. 보안 수단으로 오해하면 안 된다. API 키 단독으로는 인가(authorization)를 제공하지 않는다.

3. **Edge-Optimized API의 ACM 인증서는 반드시 us-east-1**: Edge-Optimized 엔드포인트는 CloudFront를 통해 트래픽이 흐르므로, 커스텀 도메인의 SSL/TLS 인증서를 us-east-1 ACM에서 생성해야 한다. Regional/Private는 해당 리전 ACM.

4. **WAF는 REST API에만 직접 연결 가능**: HTTP API에는 WAF Web ACL을 직접 연결할 수 없다. CloudFront를 앞에 두고 CloudFront에 WAF를 연결하는 우회 방법을 써야 한다.

5. **HTTP API Payload v2.0의 이벤트 구조가 다르다**: `httpMethod`, `resource`, `path` 필드가 없다. 기존 REST API Lambda를 그대로 붙이면 KeyError 발생. `payloadFormatVersion: "1.0"`으로 설정하거나 코드를 수정해야 한다.

6. **Lambda Authorizer REQUEST 타입의 캐시 키를 명시해야 한다**: 캐시 키를 지정하지 않으면 캐싱이 작동하지 않아 매 요청마다 Authorizer Lambda가 호출된다.

7. **Lambda Proxy 응답의 body는 반드시 문자열이어야 한다**: `json.dumps()`를 호출해야 하며, dict 객체를 직접 넣으면 API Gateway가 직렬화하지 못한다.

8. **WebSocket $disconnect 실행이 보장되지 않는다**: 네트워크 강제 종료 시 `$disconnect`가 실행되지 않을 수 있다. DynamoDB TTL로 stale 연결을 자동 정리해야 한다.

9. **WebSocket Idle Timeout 10분, Max Duration 2시간**: 이 한도를 초과하면 연결이 강제 종료된다. 클라이언트는 Ping/Pong으로 idle timeout을 방지할 수 있다.

10. **캐시 무효화(InvalidateCache)에 IAM 권한이 필요하다**: 스테이지에서 `requireAuthorizationForCacheControl`을 활성화하면, `execute-api:InvalidateCache` 권한 없는 클라이언트가 `Cache-Control: max-age=0`을 보내도 403이 반환된다.

11. **CORS는 통합 유형에 따라 처리 주체가 다르다**: Lambda Proxy에서는 Lambda가 직접 CORS 헤더를 반환해야 한다. AWS_PROXY에서 API Gateway는 자동으로 CORS 헤더를 추가하지 않는다. Gateway Response를 사용하면 API Gateway 자체 오류(4XX 포함)에도 CORS 헤더를 추가할 수 있다.

12. **DynamoDB 직접 통합 VTL에서 DynamoDB 타입 시스템을 처리해야 한다**: DynamoDB 응답은 `{"S": "value"}`, `{"N": "123"}` 형식이다. VTL에서 이를 파싱해 클린 JSON으로 변환하지 않으면 클라이언트가 DynamoDB 내부 형식을 그대로 받는다.

---

## DVA-C02 도메인 매핑

| 도메인 | 관련 Week 4 주제 | 비중 |
|--------|----------------|------|
| **Domain 1: Development with AWS Services** | Lambda Proxy 통합, VTL, DynamoDB 직접 통합 | 32% |
| **Domain 2: Security** | SigV4, Lambda Authorizer, Cognito Authorizer, Resource Policy, WAF, mTLS | 26% |
| **Domain 3: Deployment** | 스테이지, 카나리 배포, SAM 통합, Stage Variables | 24% |
| **Domain 4: Troubleshooting** | Latency vs IntegrationLatency, 429/504/502 오류 원인, Authorizer 캐시 | 18% |

---

## 📝 시나리오 연습 문제 (10문제)

**문제 1.**  
스타트업이 외부 파트너에게 API를 제공한다. 파트너 A는 월 10만 건, 파트너 B는 월 50만 건으로 API 호출을 제한해야 한다. 또한 파트너 B는 초당 100 요청, 파트너 A는 초당 20 요청으로 속도 제한이 필요하다. 가장 적절한 구성은?

A) 파트너별로 별도 REST API와 스테이지를 생성하고 각 스테이지에 rate/burst 스로틀링을 설정한다 — 차등 속도는 되지만 월 할당량(quota)을 제공하지 못하고 API가 파트너 수만큼 중복돼 운영 복잡도가 큼  
B) 파트너별 사용량 플랜(Usage Plan)을 생성하고 각 파트너에게 API 키를 발급해 해당 플랜에 연결한다  
C) Lambda Authorizer에서 파트너 ID를 확인하고 호출 횟수를 DynamoDB 카운터에 원자적으로 기록해 월 한도·초당 한도를 직접 구현한다 — 동작은 하나 분산 카운터 원자성·비용 부담이 크고 매니지드 기능의 재발명  
D) API Gateway 리소스 정책에서 파트너 IP별 `aws:SourceIp` 조건으로 요청 수를 제한한다 — 리소스 정책은 허용/거부 접근 제어일 뿐 rate limit·quota 기능이 없음

**정답: B**  
Usage Plan은 스로틀링(rateLimit/burstLimit)과 할당량(quota)을 API Key 단위로 적용하기 위해 설계된 기능이다. 파트너 A와 B에 대해 별도 플랜을 만들고 각 파트너의 API Key를 해당 플랜에 연결하면 단일 REST API와 스테이지로 차등 제한을 적용할 수 있다. A의 다중 스테이지는 불필요한 복잡도를 추가하고, C는 직접 구현 비용이 높으며 원자성 문제가 있다. D의 리소스 정책은 IP 기반 접근 제어 목적으로 요청 수 제한 기능이 없다.

---

**문제 2.**  
회사의 REST API Lambda 함수가 외부 결제 서비스에 의존한다. CloudWatch에서 `5XXError`가 증가하고 있으며, `Latency`는 29초에 가깝고 `IntegrationLatency`도 29초에 가깝다. 가장 가능성 높은 원인은?

A) Lambda Authorizer가 느려 인증 단계에서 시간이 소요되고 있다 — 그렇다면 Latency가 IntegrationLatency보다 커야 하는데 둘이 거의 같아 병목은 백엔드  
B) Lambda 함수가 응답하기 전에 API Gateway 통합 타임아웃(29초)에 도달하고 있다  
C) 클라이언트가 한도를 초과해 요청을 보내 429 스로틀링이 발생하고 있다 — 스로틀링이면 5XX가 아니라 4XXError가 증가하고 Latency가 29초에 붙지도 않음  
D) CloudWatch Logs 설정 오류로 Latency·IntegrationLatency 메트릭이 실제보다 부풀려 기록되고 있다 — 두 메트릭이 일관되게 29초에 수렴하는 패턴은 실제 백엔드 타임아웃의 전형적 신호

**정답: B**  
`Latency ≈ IntegrationLatency ≈ 29초`는 백엔드(Lambda)가 응답을 지연시키고 API Gateway 통합 타임아웃(최대 29초)에 도달해 504 Gateway Timeout을 반환하고 있음을 나타낸다. `IntegrationLatency`가 크면 병목은 백엔드다. 외부 결제 서비스 의존성이 있으므로, 결제 서비스의 응답 지연이 Lambda를 블로킹하고 있을 가능성이 높다. 해결책: Lambda에서 결제 서비스 호출에 별도 타임아웃 설정, 비동기 처리 패턴(Lambda → SQS → 결제 처리 Lambda) 도입.

---

**문제 3.**  
개발팀이 REST API에 DynamoDB 직접 통합(VTL)을 구현했다. API Gateway는 DynamoDB `GetItem`을 호출하고 응답을 클라이언트에 반환한다. 클라이언트 개발자가 응답이 `{"Item": {"name": {"S": "홍길동"}, "age": {"N": "30"}}}` 형식으로 오는 것에 불만을 제기했다. 어떻게 해결하는가?

A) 통합 뒤에 Lambda 함수를 추가해 DynamoDB 응답을 파싱한 뒤 클린 JSON으로 반환한다 — 동작은 하나 Lambda 없는 직접 통합의 핵심 이점(비용·콜드스타트 제거)을 버리는 셈  
B) DynamoDB 테이블의 속성 타입 설정을 모두 문자열(S)로 강제해 응답에서 타입 래퍼를 없앤다 — DynamoDB는 항목별 타입 래퍼를 항상 포함하므로 테이블 설정으로 제거 불가  
C) Integration Response의 VTL 매핑 템플릿을 작성해 DynamoDB 응답을 클린 JSON으로 변환한다  
D) REST API를 HTTP API로 마이그레이션하면 DynamoDB 직접 통합이 타입 래퍼를 자동으로 제거해 준다 — HTTP API는 VTL·AWS 서비스 직접 통합을 지원하지 않아 이 시나리오 자체가 불가능

**정답: C**  
DynamoDB는 타입 시스템(`"S"`, `"N"`, `"BOOL"` 등)을 포함한 형식으로 응답한다. Integration Response VTL 매핑 템플릿에서 `$input.path('$.Item.name.S')`와 같은 방식으로 각 필드를 추출해 클린 JSON을 생성할 수 있다. A는 Lambda 없는 직접 통합의 장점을 없애는 것이다. D는 HTTP API가 VTL 매핑을 지원하지 않으므로 틀리다 — HTTP API에서 DynamoDB 직접 통합 자체가 불가능하다.

---

**문제 4.**  
모바일 앱이 API Gateway REST API를 통해 데이터를 조회한다. Cognito User Pool로 인증한다. 같은 사용자가 동일한 데이터를 반복 조회할 때 Lambda 호출을 줄이고 싶다. 응답 캐싱을 설정했는데, 모든 사용자의 응답이 같은 캐시 값을 공유하는 문제가 발생했다. 원인과 해결책은?

A) 캐싱이 Cognito 토큰을 자동으로 캐시 키에 포함하지 않으므로, Authorization 헤더를 캐시 키에 추가한다  
B) API Gateway 캐싱은 사용자 단위 분리를 지원하지 않으므로 캐시를 끄고 Lambda 내부에서 사용자별 캐싱을 직접 구현한다 — 캐시 키에 헤더를 추가하면 분리가 되므로 자체 구현은 불필요  
C) Cognito Authorizer 대신 Lambda Authorizer로 바꾸면 principalId 기준으로 캐시가 자동 분리된다 — Authorizer 종류와 응답 캐시 키는 별개라 자동 분리되지 않음  
D) REST API를 HTTP API로 전환하면 토큰별 캐시가 기본 적용된다 — HTTP API는 응답 캐싱 자체를 지원하지 않아 해결책이 될 수 없음

**정답: A**  
API Gateway 캐시 키의 기본값은 요청 경로와 메서드다. `Authorization` 헤더나 사용자 ID를 캐시 키에 포함하지 않으면, 다른 사용자의 첫 번째 응답이 캐시에 저장되고 이후 모든 사용자가 같은 캐시 값을 받는다. 스테이지 설정에서 `Authorization` 헤더를 캐시 키에 추가하면 사용자별로 독립적인 캐시 항목이 생성된다. 단, 이렇게 하면 고유 토큰 수만큼 캐시 항목이 생성되므로 캐시 크기를 고려해야 한다.

---

**문제 5.**  
실시간 주식 거래 알림 시스템을 구축한다. 트레이더가 웹 브라우저에서 연결하면 서버가 가격 변동을 즉시 푸시해야 한다. 트레이더에서 서버로 메시지를 보낼 필요는 없다. 가장 적합한 아키텍처는?

A) WebSocket API + DynamoDB 연결 레지스트리 + Lambda 브로드캐스트로 양방향 채널을 구성한다 — 동작하나 단방향 푸시에는 연결 레지스트리·브로드캐스트 로직이라는 불필요한 복잡도·비용 추가  
B) REST API에 클라이언트가 5초 간격으로 폴링하게 해 최신 가격을 가져온다 — 즉시성이 떨어지고 빈 응답에도 매번 호출이 발생해 비효율적  
C) Lambda Response Streaming + Function URL (SSE 패턴)  
D) SNS + SQS + Lambda + REST API 롱 폴링으로 이벤트를 전달한다 — 구성 요소가 많아 과도하게 복잡하고 브라우저로의 실시간 푸시에는 부적합

**정답: C**  
서버 → 클라이언트 단방향 스트리밍에는 SSE 패턴이 WebSocket보다 단순하고 비용이 낮다. Lambda Response Streaming으로 `text/event-stream` Content-Type의 응답을 점진적으로 전달할 수 있다. WebSocket(A)은 양방향 통신이 필요할 때 적합하며, DynamoDB 연결 레지스트리, 브로드캐스트 로직 등 추가 복잡도가 따른다. 단방향 알림 전용이라면 C가 더 단순하고 저렴하다.

---

**문제 6.**  
회사가 REST API에 WAF를 설정해 SQL 인젝션을 차단하려 한다. 그런데 일부 합법적인 요청도 차단된다. 팀은 차단된 요청의 패턴을 분석하고 WAF 규칙을 세밀하게 조정하고 싶다. 어떤 WAF 설정을 활성화해야 하는가?

A) WAF Sampled Requests를 활성화해 매칭된 요청 샘플을 콘솔에서 확인한다 — 일부 샘플만 보여줘 분석엔 도움되나, 차단을 멈추지 않아 합법 요청이 계속 막힘  
B) API Gateway Execution Logs를 INFO 레벨로 올려 차단 요청을 상세 로깅한다 — 실행 로그는 API GW 처리 내역일 뿐 WAF 규칙 매칭 원인을 보여주지 못함  
C) X-Ray 추적을 활성화해 요청 경로별 지연과 차단 지점을 분석한다 — X-Ray는 성능 트레이싱 도구라 WAF 규칙 튜닝에 쓸 데이터를 제공하지 않음  
D) WAF Web ACL을 count 모드로 전환하고 CloudWatch Logs를 활성화한다

**정답: D**  
WAF의 count 모드는 규칙을 실제로 차단하지 않고 매칭만 기록한다. 이를 통해 false positive(합법적 요청 차단)를 실제 차단 없이 분석할 수 있다. WAF 로깅을 Kinesis Firehose나 CloudWatch Logs로 설정하면 차단/계수된 요청의 상세 정보(IP, 요청 URI, 매칭된 규칙 등)를 볼 수 있다. 규칙이 안정화된 후 block 모드로 전환하는 것이 WAF 규칙 배포의 표준 접근법이다.

---

**문제 7.**  
스타트업이 Next.js 백엔드 API를 AWS에 배포하려 한다. 각 API 경로를 별도 Lambda로 분리했으며, 요구사항은: (1) 낮은 비용, (2) Cognito 기반 JWT 인증, (3) 자동 CORS 설정, (4) 커스텀 도메인. 가장 적합한 API 유형은?

A) REST API (Cognito User Pool Authorizer + 수동 CORS + us-east-1 ACM 커스텀 도메인) — 요구는 충족하나 호출당 비용이 약 3.5배 높고 CORS를 수동 구성해야 해 비용·자동화 요건에 불리  
B) HTTP API (JWT Authorizer + 자동 CORS 설정 + 커스텀 도메인)  
C) Function URL (자동 CORS + IAM 인증)로 각 Lambda를 직접 노출 — 함수당 하나의 URL만 가능해 여러 경로 라우팅·통합 커스텀 도메인을 제공하지 못함  
D) WebSocket API로 클라이언트와 지속 연결을 맺어 요청을 처리한다 — 요청-응답형 REST 백엔드에는 부적합한 양방향 프로토콜이며 JWT Authorizer·자동 CORS도 미지원

**정답: B**  
HTTP API는 네 가지 요구사항을 모두 충족한다: (1) REST API 대비 약 70% 저렴, (2) JWT Authorizer로 Cognito JWT 네이티브 검증 가능, (3) 자동 CORS 설정 지원, (4) 커스텀 도메인 지원. Function URL은 단일 함수만 노출 가능하고 여러 API 경로를 라우팅할 수 없으며 커스텀 도메인 지원이 제한적이다.

---

**문제 8.**  
Lambda Authorizer(TOKEN 타입, TTL 300초)를 사용하는 API가 있다. 보안팀이 특정 사용자의 JWT 토큰을 즉시 무효화해야 한다는 요청을 했다. 토큰은 아직 만료되지 않았다. 가장 빠른 방법은?

A) Cognito에서 해당 사용자 계정을 비활성화해 토큰을 무효화한다 — 새 토큰 발급은 막아도 이미 캐시된 Authorizer Allow 정책은 TTL 동안 그대로 유효해 즉시 차단되지 않음  
B) Lambda Authorizer 함수 코드에서 해당 토큰을 블랙리스트에 추가하고, Authorizer TTL을 0으로 임시 변경한다  
C) Authorizer 캐시 TTL 300초가 만료될 때까지 기다렸다가 자연 무효화되게 둔다 — 즉시 무효화 요구를 충족하지 못하고 그동안 접근이 허용됨  
D) API Gateway 스테이지를 재배포해 Authorizer 캐시를 강제로 비운다 — 재배포는 Authorizer 결과 캐시를 비우지 않아 캐시된 토큰은 계속 통과

**정답: B**  
Lambda Authorizer의 TTL 캐시는 기존에 유효하다고 판단한 토큰의 응답을 저장한다. 토큰을 블랙리스트에 추가해도 TTL 300초가 남아있으면 캐시된 Allow 정책이 계속 사용된다. 즉시 무효화하려면 Authorizer TTL을 0으로 설정해 캐싱을 비활성화하고, Lambda 내부 블랙리스트를 확인하도록 코드를 수정해야 한다. TTL을 영구적으로 0으로 두면 모든 요청마다 Lambda가 호출되므로, 무효화 처리 후 TTL을 복원해야 한다.

---

**문제 9.**  
WebSocket API 기반 실시간 채팅에서 특정 채팅방에 있는 사용자들에게만 메시지를 브로드캐스트해야 한다. DynamoDB에 연결 레지스트리가 있다. 가장 효율적인 DynamoDB 조회 방법은?

A) Scan + FilterExpression으로 전체 테이블을 읽은 뒤 해당 채팅방 연결만 필터링한다 — Scan은 전체 항목을 읽어 RCU·지연이 연결 수에 선형 증가해 비효율적  
B) 채팅방 ID를 GSI Partition Key로 설정하고 Query를 사용해 해당 채팅방의 연결만 조회한다  
C) 채팅방마다 별도 DynamoDB 테이블을 만들어 연결을 분리 저장한다 — 채팅방 수만큼 테이블이 늘어 관리·한도 부담이 크고 동적 채팅방 생성에 부적합  
D) ElastiCache Redis에 채팅방-연결 매핑을 두고 조회한다 — 빠르지만 ElastiCache 클러스터라는 추가 인프라·비용·운영이 필요해 본 요건엔 과함

**정답: B**  
GSI(Global Secondary Index)를 사용하면 채팅방 ID를 Partition Key로 Query 할 수 있어 O(n) Scan이 아닌 O(k) Query(k = 해당 채팅방 연결 수)가 가능하다. Scan(A)은 테이블 전체를 읽어 비용과 시간이 선형으로 증가한다. 연결 수가 증가할수록 Scan과 GSI Query의 성능 차이가 커진다. D도 유효하지만 추가 인프라(ElastiCache) 비용과 관리가 필요하다.

---

**문제 10.**  
팀이 API Gateway HTTP API와 Lambda 통합을 사용한다. 기존 Lambda 코드는 REST API에서 작동하던 코드로, `event["requestContext"]["identity"]["sourceIp"]`로 클라이언트 IP를 읽는다. HTTP API로 전환 후 해당 코드에서 오류가 발생한다. 근본 원인과 해결책은?

A) HTTP API는 클라이언트 IP를 이벤트로 제공하지 않으므로 REST API를 그대로 유지해야 한다 — HTTP API도 IP를 제공하며 위치가 바뀌었을 뿐이라 전환을 포기할 이유가 없음  
B) HTTP API Payload v2.0에서 IP는 `event["requestContext"]["http"]["sourceIp"]`에 있다. 코드를 수정하거나 payloadFormatVersion을 "1.0"으로 설정한다  
C) Lambda 실행 역할에 `execute-api` 관련 권한이 빠져 IP 필드 접근이 거부되고 있다 — IAM 권한은 이벤트 페이로드 필드 가용성과 무관해 원인이 아님  
D) sourceIp 대신 `X-Forwarded-For` 헤더를 직접 파싱해 첫 IP를 추출해야 한다 — 가능은 하나 v2.0이 sourceIp를 제공하므로 헤더 파싱은 불필요한 우회  

**정답: B**  
HTTP API는 기본적으로 Payload Format Version 2.0을 사용한다. v2.0에서 요청 컨텍스트 구조가 변경되어 `requestContext.identity`가 없어지고, 클라이언트 IP는 `requestContext.http.sourceIp`로 이동했다. 해결책은 두 가지다: Lambda 통합 설정에서 `payloadFormatVersion: "1.0"`을 지정해 v1.0(REST API 호환) 이벤트를 받거나, Lambda 코드를 v2.0 구조에 맞게 수정한다.

---

## Week 4 자기 평가

| 문제 유형 | 포함 문제 | 재학습 필요 시 |
|----------|----------|---------------|
| 인증 방식 선택 | 1, 8 | Day 18 |
| 통합 유형·VTL | 3 | Day 17 |
| 캐싱·스로틀링 | 4, 1 | Day 18 |
| 실시간 통신 설계 | 5, 9 | Day 19 |
| API 유형 선택 | 7 | Day 16, 19 |
| 트러블슈팅 (메트릭) | 2 | Day 18 |
| WAF·보안 | 6 | Day 18 |
| Payload Format | 10 | Day 19 |

| 점수 | 평가 |
|------|------|
| 9-10 | API Gateway 완전 이해. Week 5로 진행 |
| 7-8 | 우수. 틀린 문제의 Day 파일을 재확인 |
| 5-6 | 양호. Week 4 Day 16-19 함정 목록 재숙지 |
| 3-4 | 보통. Day 16-19 전체 재학습 권장 |
| 0-2 | Week 4 처음부터 재학습 필요 |
