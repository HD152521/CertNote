# Day 18 - API Gateway 보안·캐싱·스로틀링: SigV4부터 Token Bucket까지 요청이 통제되는 방법

API Gateway를 "그냥 HTTP 프록시"로 이해하면 보안 설계에서 반드시 실수한다. 실제로 API Gateway는 요청이 백엔드에 도달하기 전에 최소 다섯 개의 독립적인 통제 레이어를 통과시킨다: WAF, Resource Policy, Authorizer, Throttle, Cache. 각 레이어는 서로 다른 문제를 해결하며, 어떤 레이어를 언제 써야 하는지 잘못 판단하면 429가 쏟아지거나 인증 우회 취약점이 생긴다. 이 파일에서는 각 통제 레이어의 내부 동작 원리를 해부하고, DVA-C02가 반복해서 출제하는 경계 케이스들을 짚는다.

---

## SigV4와 IAM 인증: AWS 내부 서비스가 API를 호출하는 방법

IAM 인증 방식은 AWS Signature Version 4(SigV4)를 기반으로 한다. SigV4는 2012년 AWS가 공식화한 HMAC-SHA256 기반 요청 서명 프로토콜로, 현재 모든 AWS SDK가 자동으로 구현한다. 핵심 아이디어는 요청 내용 전체(URL, 헤더, 바디)의 해시를 포함한 "CanonicalRequest"를 만들고, 이를 Access Key Secret으로 서명해 `Authorization` 헤더에 담는 것이다.

```
Authorization: AWS4-HMAC-SHA256
  Credential=AKIAIOSFODNN7EXAMPLE/20240115/ap-northeast-2/execute-api/aws4_request,
  SignedHeaders=host;x-amz-date,
  Signature=<HMAC-SHA256 계산값>
```

API Gateway는 이 헤더를 받아 IAM에 서명 검증을 요청한다. 검증이 통과되면 요청자의 IAM 자격을 확인하고, `execute-api:Invoke` 권한이 있는지 평가한다. 서명에는 날짜가 포함되어 있어 **5분 이상 지난 요청은 자동 거부**된다 — 리플레이 공격 방지다.

> 💡 **관련 이론**: SigV4는 RFC 2104(HMAC)와 NIST FIPS 180-4(SHA-256)를 구현한다. 서명 범위에 날짜·리전·서비스를 포함시켜 서명 값이 다른 서비스나 리전에서 재사용되는 것을 막는 "scoped signing" 방식이다. 동일한 개념이 Azure의 Shared Key Authentication, GCP의 HMAC Signed URL에도 적용된다.

IAM 인증은 **AWS 내부 서비스 간 통신**에 최적화되어 있다. Lambda 함수가 다른 AWS 계정의 API Gateway를 호출하거나, EC2 인스턴스의 Instance Role로 API를 호출하는 시나리오가 전형적이다. 반면 외부 사용자(모바일 앱, 서드파티 파트너)에게 SigV4를 강요하는 것은 비현실적이다 — AWS SDK 없이 SigV4를 직접 구현하는 것은 매우 번거롭다.

> ⚠️ **함정**: `aws:SourceIp` 조건은 IP 기반 접근 제한에 쓸 수 있지만, 클라이언트가 CloudFront나 NAT Gateway를 경유한다면 **원본 IP가 아닌 CloudFront/NAT IP가 `aws:SourceIp`에 찍힌다**. 진짜 클라이언트 IP로 제한하려면 `aws:VpcSourceIp`(VPC 내부) 또는 X-Forwarded-For 헤더 기반의 WAF Rule을 사용해야 한다.

---

## Lambda Authorizer의 내부 메커니즘: TOKEN vs REQUEST 타입

Lambda Authorizer는 API Gateway가 백엔드를 호출하기 전, 별도의 Lambda 함수를 실행해 IAM 정책을 동적으로 생성하는 방식이다. 이를 통해 OAuth, JWT, API 토큰, LDAP 등 AWS가 기본 제공하지 않는 모든 인증 방식을 구현할 수 있다.

Lambda Authorizer는 두 가지 타입이 있으며, 이 차이가 시험에서 자주 출제된다.

**TOKEN 타입**: `Authorization` 헤더(또는 설정한 헤더) 하나만 Lambda에 전달된다. 단순 Bearer 토큰 검증에 적합하다.

```python
# TOKEN 타입 event 구조
{
    "type": "TOKEN",
    "authorizationToken": "Bearer eyJhbGciOiJSUzI1NiJ9...",
    "methodArn": "arn:aws:execute-api:ap-northeast-2:123456789:abc123/prod/GET/orders"
}
```

**REQUEST 타입**: 헤더, 쿼리 파라미터, 경로 파라미터, 스테이지 변수 전체가 Lambda에 전달된다. 여러 파라미터 조합으로 인증을 결정해야 할 때 사용한다.

```python
# REQUEST 타입 event 구조 (간략)
{
    "type": "REQUEST",
    "headers": {
        "Authorization": "Bearer ...",
        "X-Tenant-ID": "company-abc"
    },
    "queryStringParameters": {"version": "v2"},
    "pathParameters": {"proxy": "users/123"},
    "requestContext": {...},
    "methodArn": "arn:aws:execute-api:..."
}
```

Lambda Authorizer가 반환해야 하는 응답은 IAM 정책 문서다. `Resource` 필드에 와일드카드(`*`)를 사용해 해당 Principal의 모든 API 접근을 한 번에 허용/거부할 수 있다:

```python
def lambda_handler(event, context):
    token = event.get("authorizationToken", "")
    
    try:
        # JWT 검증 (외부 라이브러리 사용)
        payload = verify_jwt(token)
        user_id = payload["sub"]
        
        # 컨텍스트에 사용자 정보 추가 (백엔드 Lambda에서 $context.authorizer.userId로 접근)
        return {
            "principalId": user_id,
            "policyDocument": {
                "Version": "2012-10-17",
                "Statement": [{
                    "Action": "execute-api:Invoke",
                    "Effect": "Allow",
                    # 와일드카드로 이 API의 모든 스테이지·메서드 허용
                    "Resource": "arn:aws:execute-api:ap-northeast-2:123:abc123/*"
                }]
            },
            "context": {
                "userId": user_id,
                "tier": payload.get("tier", "free")
            }
        }
    except Exception:
        # 토큰 무효 → 403 Forbidden (Deny 정책 반환)
        raise Exception("Unauthorized")  # 또는 Deny 정책 반환
```

> 🔍 **더 깊이**: Lambda Authorizer가 `raise Exception("Unauthorized")`를 던지면 API Gateway는 **403 Forbidden**을 반환한다. 이는 일반적인 HTTP 관례(401 Unauthorized)와 다르다. 실제 401을 반환하려면 Gateway Response를 커스터마이즈해야 한다. 또한 Deny 정책을 반환하면 API Gateway는 내부적으로 해당 정책을 IAM 엔진에 평가해 403을 반환한다 — 이 과정에서 Authorizer Lambda의 실행 비용은 이미 발생한다.

**Authorizer 결과 캐싱**은 비용 최적화의 핵심이다. API Gateway는 캐시 키(TOKEN 타입: 토큰 값, REQUEST 타입: 지정한 파라미터 조합)를 기준으로 IAM 정책 응답을 메모리에 보관한다. TTL은 0~3600초(기본 300초)로 설정 가능하다.

| 항목 | TOKEN 타입 | REQUEST 타입 |
|------|-----------|-------------|
| 캐시 키 | 토큰 값 (Authorization 헤더) | 명시적으로 지정한 헤더/쿼리 조합 |
| 주요 사용 사례 | JWT Bearer 토큰 | 멀티 헤더 인증, 테넌트 기반 |
| event 크기 | 작음 | 큼 (전체 요청 컨텍스트) |
| Lambda timeout 제한 | 최대 29초 (API GW 타임아웃 내) | 동일 |

> ⚠️ **함정**: REQUEST 타입에서 캐시 키를 명시적으로 지정하지 않으면 캐싱이 아예 작동하지 않는다. 콘솔에서 "Cache key" 설정란을 반드시 채워야 한다. 빈 상태로 두면 매 요청마다 Authorizer Lambda가 호출된다.

---

## Cognito User Pool Authorizer: Lambda 없이 JWT를 검증하는 방법

Cognito User Pool Authorizer는 Lambda 코드 없이 Cognito가 발급한 JWT(ID Token 또는 Access Token)를 API Gateway가 직접 검증하는 방식이다. 내부적으로 API Gateway는 Cognito User Pool의 JWKS(JSON Web Key Set) 엔드포인트에서 공개 키를 가져와 JWT 서명을 검증한다.

```
Cognito User Pool JWKS 엔드포인트:
https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json
```

인증 흐름:
1. 클라이언트가 Cognito에 로그인 → ID Token(JWT) 발급
2. 클라이언트가 `Authorization: {ID Token}` 헤더와 함께 API 호출
3. API Gateway가 Cognito JWKS에서 공개 키 조회 → JWT 서명 검증
4. JWT의 `aud`(Audience) 클레임이 설정한 Client ID와 일치하는지 확인
5. 토큰 만료 여부(`exp` 클레임) 확인
6. 모두 통과 → 백엔드 Lambda 호출

> 💡 **관련 이론**: JWT(JSON Web Token, RFC 7519)는 Header.Payload.Signature 세 부분으로 구성된다. Cognito는 RS256(RSA + SHA-256) 알고리즘으로 서명한다. API Gateway가 JWKS에서 가져온 공개 키로 서명을 검증하기 때문에 Cognito 서버에 토큰 검증 요청을 보내지 않아도 된다 — 이를 "오프라인 검증(offline verification)"이라 한다.

**Cognito Authorizer vs Lambda Authorizer 선택 기준**:

| 기준 | Cognito User Pool Authorizer | Lambda Authorizer |
|------|------------------------------|-------------------|
| 인증 공급자 | Cognito User Pool만 | 모든 공급자 (Auth0, Okta, 자체 구현) |
| 구현 복잡도 | 낮음 (Lambda 코드 없음) | 높음 (Lambda 함수 작성) |
| 추가 로직 | 불가 (토큰 검증만) | 가능 (DB 조회, 권한 레벨 확인 등) |
| 비용 | Cognito 비용만 | Lambda + Cognito/외부 IdP |
| 소셜 로그인 지원 | Cognito Identity Pool 경유 | 직접 구현 |

---

## Resource Policy: 네트워크 레벨의 접근 제어

Resource Policy는 API Gateway에 IAM 기반 접근 제어 정책을 직접 부착하는 방식이다. Lambda의 Resource-based Policy와 개념이 같다. REST API에서만 지원되며, HTTP API는 지원하지 않는다.

주요 사용 사례 세 가지:

**1. IP 화이트리스트**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Deny",
            "Principal": "*",
            "Action": "execute-api:Invoke",
            "Resource": "execute-api:/*",
            "Condition": {
                "NotIpAddress": {
                    "aws:SourceIp": ["203.0.113.0/24", "198.51.100.50/32"]
                }
            }
        },
        {
            "Effect": "Allow",
            "Principal": "*",
            "Action": "execute-api:Invoke",
            "Resource": "execute-api:/*"
        }
    ]
}
```

**2. VPC Endpoint 전용 접근 (Private API)**
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": "*",
            "Action": "execute-api:Invoke",
            "Resource": "execute-api:/*",
            "Condition": {
                "StringEquals": {
                    "aws:SourceVpce": "vpce-0abc1234def56789"
                }
            }
        }
    ]
}
```

**3. 교차 계정(Cross-Account) 호출 허용**
```json
{
    "Effect": "Allow",
    "Principal": {
        "AWS": "arn:aws:iam::987654321098:role/PartnerRole"
    },
    "Action": "execute-api:Invoke",
    "Resource": "execute-api:/*"
}
```

> 🔍 **더 깊이**: Private API(VPC Endpoint 전용)를 만들 때, Resource Policy에서 VPC Endpoint를 Allow해야 할 뿐만 아니라 **VPC Endpoint의 "Enable Private DNS" 설정**도 확인해야 한다. Private DNS가 활성화되면 `{api-id}.execute-api.{region}.amazonaws.com`이 VPC 내에서 Endpoint의 ENI IP로 해석된다. 비활성화 상태에서는 Endpoint DNS 이름을 직접 써야 한다.

---

## mTLS와 WAF: 기업 B2B와 웹 공격 방어

**mTLS(Mutual TLS)**는 일반 TLS의 단방향 서버 인증과 달리, 클라이언트도 인증서를 제시해 서버가 클라이언트를 검증한다. IoT 디바이스, B2B 파트너 API에서 사용한다.

API Gateway에서 mTLS를 활성화하려면:
1. 신뢰할 CA(Certificate Authority)의 인증서를 번들로 만든다
2. S3에 업로드한다 (`s3://bucket/truststore.pem`)
3. Custom Domain에 mTLS를 활성화하고 S3 경로를 지정한다

```bash
aws apigateway create-domain-name \
  --domain-name api.example.com \
  --mutual-tls-authentication truststoreUri=s3://my-bucket/truststore.pem \
  --regional-certificate-arn arn:aws:acm:...
```

> 📚 **사례**: 2021년 금융권 오픈 API 생태계(오픈뱅킹)에서 핀테크 서비스와 은행 API 간 연결에 mTLS가 의무화됐다. 한국인터넷진흥원(KISA) 가이드라인은 API 게이트웨이 레벨의 mTLS를 권장한다. AWS API Gateway의 mTLS는 이 요건을 충족하는 관리형 솔루션으로 사용된다.

**WAF(Web Application Firewall)** 통합은 REST API(Edge-Optimized, Regional)에서만 직접 지원된다. HTTP API는 WAF Web ACL을 직접 연결할 수 없고, 앞단에 CloudFront를 두어 CloudFront에 WAF를 붙이는 우회 방식을 써야 한다.

| WAF 규칙 유형 | 용도 |
|--------------|------|
| AWS Managed Rules (AWSManagedRulesCommonRuleSet) | SQL 인젝션, XSS, 알려진 악성 봇 차단 |
| Rate-based Rule | IP당 5분 내 요청 수 초과 시 차단 |
| IP Set Rule | 특정 IP/CIDR 허용 또는 차단 |
| Geographic Match Rule | 특정 국가 트래픽 차단 |
| Custom Rule (Regex) | 헤더·바디 패턴 매칭 |

---

## API 키와 사용량 플랜: 식별과 할당량의 메커니즘

API 키(API Key)는 `x-api-key` 헤더로 전달되는 문자열 식별자다. 공식 AWS 문서는 API 키를 "인증(authentication) 수단이 아닌 사용량 추적 수단"으로 명시한다. 이 구분이 시험에서 매우 자주 출제된다.

API 키가 인증 수단이 아닌 이유: API 키는 암호화되지 않은 상태로 헤더에 전달된다. HTTPS를 사용해도 중간자 공격이나 로그 노출로 유출될 수 있다. API 키가 유출되면 즉시 폐기하고 재발급해야 한다 — 반면 IAM 자격증명은 세밀한 권한 제어와 자동 교체를 지원한다.

사용량 플랜(Usage Plan)은 API 키와 API 스테이지를 연결해 세 가지 제한을 적용한다:

```
사용량 플랜 = {
    스로틀링: {
        rateLimit: 100,        // 초당 평균 요청 수 (Token Bucket fill rate)
        burstLimit: 200        // 순간 최대 요청 수 (Token Bucket capacity)
    },
    할당량: {
        limit: 10000,          // 최대 요청 수
        period: "MONTH"        // DAY | WEEK | MONTH
    }
}
```

> 💡 **관련 이론**: 사용량 플랜의 스로틀링은 Token Bucket 알고리즘으로 구현된다. 버킷 용량은 `burstLimit`, 충전 속도는 `rateLimit`이다. 버킷이 비어있으면 429를 반환한다. 이는 트래픽이 순간적으로 급등해도 `burstLimit`까지는 흡수할 수 있게 해주는 "burst tolerance" 개념이다. RFC 6585(Additional HTTP Status Codes)는 429 상태 코드를 정의하며, `Retry-After` 헤더로 재시도 시간을 알릴 수 있다.

```bash
# API 키 생성 및 사용량 플랜 연결 전체 흐름
# 1. API 키 생성
KEY_ID=$(aws apigateway create-api-key \
  --name "Partner-A-Key" \
  --enabled \
  --query 'id' --output text)

# 2. 사용량 플랜 생성
PLAN_ID=$(aws apigateway create-usage-plan \
  --name "PartnerPlan" \
  --throttle burstLimit=200,rateLimit=100 \
  --quota limit=50000,period=MONTH \
  --api-stages "apiId=abc123,stage=prod,throttle={GET/orders={burstLimit=50,rateLimit=20}}" \
  --query 'id' --output text)

# 3. API 키 ↔ 사용량 플랜 연결
aws apigateway create-usage-plan-key \
  --usage-plan-id $PLAN_ID \
  --key-id $KEY_ID \
  --key-type API_KEY
```

---

## 응답 캐싱: TTL·캐시 키·무효화의 정확한 작동 방식

API Gateway 캐싱은 스테이지 레벨에서 활성화하고, 메서드 레벨에서 오버라이드할 수 있다. 캐시 클러스터는 별도의 전용 인프라로, 크기에 따라 비용이 발생한다.

| 캐시 크기 | 비용 참고 |
|-----------|-----------|
| 0.5 GB | 소규모 API |
| 1.6 GB | 중간 규모 |
| 6.1 GB | 대규모 |
| 13.5 GB | 고성능 |
| 28.4 GB | 엔터프라이즈 |
| 58.2 GB | 대형 |
| 118 GB | 초대형 |
| 237 GB | 최대 |

캐시 키는 기본적으로 **메서드 + 경로**가 된다. 쿼리 파라미터와 헤더를 추가 캐시 키로 지정할 수 있다:

```
GET /products?category=electronics&page=1
→ 캐시 키: GET /products + category=electronics + page=1
→ category 또는 page가 다르면 캐시 MISS
```

**캐시 무효화 메커니즘**은 두 가지다:

**1. 클라이언트 주도 무효화**: `Cache-Control: max-age=0` 헤더를 요청에 포함한다. 이를 아무 클라이언트나 할 수 있으면 캐시가 무력화되므로, `execute-api:InvalidateCache` IAM 권한이 있는 클라이언트만 허용하도록 설정해야 한다.

```json
// 스테이지 설정에서 캐시 무효화 IAM 권한 강제
{
  "/*/*/caching/requireAuthorizationForCacheControl": true
}
```

권한 없이 `max-age=0`을 보내면 API Gateway는 **403 Forbidden**을 반환한다 (무효화 시도를 차단).

**2. 콘솔/API에서 전체 캐시 플러시**: CloudFormation 배포나 새 스테이지 배포 후 수동으로 캐시를 비울 수 있다.

> ⚠️ **함정**: 캐시는 스테이지 레벨에서 활성화하지만 실제 응답이 캐시되는 것은 **GET 요청**만이다. POST, PUT, DELETE는 캐시되지 않는다. 또한 Lambda Authorizer의 결과 캐시와 API 응답 캐시는 완전히 독립적이다 — 하나를 무효화해도 다른 하나에 영향이 없다.

---

## 스로틀링의 계층 구조: 네 개 레이어와 Token Bucket

API Gateway의 스로틀링은 네 개의 독립적인 레이어로 구성된다. 상위 레이어가 하위 레이어보다 먼저 적용된다.

```
레이어 1: AWS 계정 수준 (리전당 기본 10,000 RPS / 버스트 5,000)
    ↓ 초과 시 429
레이어 2: 스테이지 수준 (Default Method Throttling)
    ↓ 초과 시 429
레이어 3: 메서드 수준 (Route-level Throttling)
    ↓ 초과 시 429
레이어 4: 사용량 플랜 수준 (API 키별)
    ↓ 초과 시 429
    ↓ 모두 통과
백엔드 통합
```

버스트(Burst) 한도는 순간적인 트래픽 급증을 허용하는 상한이다. 리전별로 다르다:

| 리전 | 계정 기본 RPS | 버스트 한도 |
|------|-------------|-----------|
| us-east-1 | 10,000 | 5,000 |
| us-west-2 | 10,000 | 5,000 |
| ap-northeast-2 (서울) | 10,000 | 5,000 |
| ap-southeast-1 | 10,000 | 5,000 |

> 💡 **관련 이론**: API Gateway의 스로틀링은 **Token Bucket** 알고리즘의 변형이다. 버킷은 `burstLimit`만큼의 토큰을 담을 수 있고, `rateLimit`의 속도로 토큰이 채워진다. 요청이 들어올 때마다 토큰 하나를 소비한다. 버킷이 비어있으면 429가 반환된다. 이와 달리 **Leaky Bucket**은 일정한 속도로 요청을 처리하고 큐가 가득 차면 거부한다. Token Bucket은 버스트를 허용하고 Leaky Bucket은 허용하지 않는다는 점이 핵심 차이다.

---

## CloudWatch 로깅과 메트릭: 문제를 진단하는 방법

API Gateway는 두 종류의 로그를 CloudWatch Logs에 기록한다:

**액세스 로그(Access Log)**: 요청/응답의 구조화된 로그. 커스텀 형식으로 설정 가능하다.
```json
{
    "requestId": "$context.requestId",
    "ip": "$context.identity.sourceIp",
    "caller": "$context.identity.caller",
    "user": "$context.identity.user",
    "requestTime": "$context.requestTime",
    "httpMethod": "$context.httpMethod",
    "resourcePath": "$context.resourcePath",
    "status": "$context.status",
    "protocol": "$context.protocol",
    "responseLength": "$context.responseLength",
    "integrationLatency": "$context.integrationLatency",
    "responseLatency": "$context.responseLatency"
}
```

**실행 로그(Execution Log)**: 요청 처리의 상세 단계. INFO 또는 ERROR 레벨 선택 가능. INFO는 모든 단계를 로깅해 디버깅에 유용하지만 비용이 증가한다.

주요 CloudWatch 메트릭:

| 메트릭 | 설명 | 활용 |
|--------|------|------|
| `Count` | 총 API 호출 수 | 트래픽 모니터링 |
| `Latency` | 클라이언트 요청 수신 ~ 응답 반환 (전체) | 전체 응답 시간 |
| `IntegrationLatency` | 백엔드 호출 ~ 응답 수신 (통합 시간만) | 백엔드 성능 |
| `4XXError` | 클라이언트 오류 (400, 401, 403, 429 등) | 오용/스로틀링 탐지 |
| `5XXError` | 서버 오류 (500, 502, 503, 504 등) | 백엔드 장애 탐지 |
| `CacheHitCount` | 캐시에서 응답한 요청 수 | 캐시 효율성 |
| `CacheMissCount` | 캐시에 없어 백엔드를 호출한 요청 수 | 캐시 효율성 |

> 🔍 **더 깊이**: `Latency - IntegrationLatency`의 차이값이 크다면 API Gateway 내부 처리(인증, 매핑, 캐싱 조회 등)가 병목이라는 의미다. 반대로 차이가 작고 `Latency` 자체가 높다면 백엔드(Lambda, DynamoDB 등)가 느린 것이다. 이 두 메트릭의 비교는 트러블슈팅의 첫 번째 단계다. X-Ray를 활성화하면 각 세그먼트별 시간을 더 세밀하게 분석할 수 있다.

**504 Gateway Timeout**은 통합 타임아웃(최대 29초) 초과 시 발생한다. 이는 클라이언트에게 `5XXError`로 잡힌다. Lambda 함수가 29초 내에 응답하지 않으면 무조건 504가 발생한다. Lambda의 최대 실행 시간(15분)과 무관하게 API Gateway 타임아웃이 먼저 끊는다.

---

## 모든 인증 방식 비교: 시험 빈출 매핑 테이블

| 인증 방식 | 작동 원리 | 주요 사용 사례 | REST API | HTTP API |
|----------|-----------|---------------|----------|----------|
| IAM(SigV4) | AWS 서명 검증 | 내부 서비스 간 | ✅ | ✅ |
| Lambda Authorizer (TOKEN) | Bearer 토큰 → Lambda | OAuth, 자체 JWT | ✅ | ✅ |
| Lambda Authorizer (REQUEST) | 복합 파라미터 → Lambda | 멀티 헤더 인증 | ✅ | ✅ |
| Cognito User Pool Authorizer | JWT 자동 검증 | Cognito 사용자 | ✅ | ❌(JWT Authorizer 사용) |
| JWT Authorizer | OIDC JWT 검증 | Cognito, Auth0, Okta | ❌ | ✅ |
| API Key | x-api-key 헤더 식별 | 파트너 API 추적 | ✅ | ✅ |
| Resource Policy | IP/VPC/계정 차단 | 네트워크 제어 | ✅ | ❌ |
| mTLS | 클라이언트 인증서 | IoT, B2B | ✅ | ✅ |
| WAF Web ACL | 패턴 기반 차단 | 웹 공격 방어 | ✅ | ❌(CloudFront 경유) |

> 📚 **사례**: 2022년 트위터 API 사태(유료화 전환)에서 많은 서비스가 API 키 기반 접근 통제의 취약점을 경험했다. 단순 API 키만으로 접근 제어를 하다가 키가 유출되면 모든 사용량 한도를 소진당하는 사례가 있었다. AWS API Gateway 모범 사례는 API 키 + Lambda Authorizer를 조합해 "식별(API Key) + 인증(Authorizer)"을 분리하는 것이다.

---

## 📝 연습 문제

**문제 1.**  
회사의 내부 Lambda 함수가 다른 AWS 계정에 있는 API Gateway REST API를 호출해야 한다. Lambda 함수에 최소 권한 원칙을 적용하면서 가장 안전하게 인증하는 방법은?

A) API 키를 생성하고 Lambda 환경 변수에 저장한다  
B) Lambda 실행 역할에 `execute-api:Invoke` 권한을 부여하고 SigV4 서명으로 호출한다  
C) Cognito User Pool Authorizer를 사용하고 Lambda가 Cognito에 로그인한다  
D) Resource Policy에서 Lambda 함수 ARN을 허용한다

**정답: B**  
SigV4는 Lambda의 IAM 역할 자격증명을 자동으로 활용하며, AWS SDK가 서명을 처리한다. 교차 계정 시 대상 API의 Resource Policy에서 원본 계정의 역할 ARN을 Allow하고, Lambda 역할에 `execute-api:Invoke` 권한을 부여해야 한다. API 키는 인증 수단이 아니므로 최소 권한 원칙에 부합하지 않는다.

---

**문제 2.**  
Lambda Authorizer(TOKEN 타입)를 사용하는 API에서 같은 JWT 토큰으로 반복 호출 시 매번 Authorizer Lambda가 실행된다. 이를 최적화하는 가장 직접적인 방법은?

A) Provisioned Concurrency를 Authorizer Lambda에 설정한다  
B) Authorizer의 TTL을 0보다 크게 설정해 결과 캐싱을 활성화한다  
C) Lambda Authorizer를 Cognito User Pool Authorizer로 교체한다  
D) API Gateway HTTP API로 마이그레이션한다

**정답: B**  
TOKEN 타입 Lambda Authorizer는 토큰 값을 캐시 키로 사용해 IAM 정책 응답을 캐시한다. TTL을 0보다 크게(기본 300초) 설정하면 동일 토큰으로 오는 요청에 대해 Lambda를 다시 호출하지 않고 캐시된 정책을 반환한다. 이는 지연 시간과 Lambda 실행 비용을 모두 줄인다.

---

**문제 3.**  
API Gateway REST API에 WAF를 적용해 SQL 인젝션 공격을 차단하려 한다. 이 API는 Regional 엔드포인트다. 올바른 구성은?

A) CloudFront 앞에 WAF를 적용한다  
B) WAF Web ACL을 API Gateway REST API에 직접 연결한다  
C) Lambda Authorizer에서 SQL 인젝션 패턴을 검사한다  
D) HTTP API로 전환하고 WAF를 적용한다

**정답: B**  
Regional 엔드포인트 REST API는 WAF Web ACL을 직접 연결할 수 있다. A는 Edge-Optimized 또는 HTTP API(WAF 미지원) 경우에 쓰는 우회 방법이다. HTTP API는 WAF를 직접 지원하지 않으므로 D는 틀리다.

---

**문제 4.**  
API Gateway의 응답 캐시가 활성화되어 있다. 특정 클라이언트가 최신 데이터가 필요해 `Cache-Control: max-age=0` 헤더를 보냈더니 403 Forbidden을 받았다. 원인은?

A) 캐시가 비활성화되어 있어서  
B) 해당 클라이언트에 `execute-api:InvalidateCache` IAM 권한이 없어서  
C) Cache-Control 헤더가 API Gateway에서 지원되지 않아서  
D) 클라이언트의 API 키가 만료되어서

**정답: B**  
API Gateway 스테이지에서 "캐시 무효화 시 인증 요구(requireAuthorizationForCacheControl)"가 활성화된 경우, `execute-api:InvalidateCache` 권한이 없는 요청자가 `max-age=0`을 보내면 403이 반환된다. 이는 의도치 않은 캐시 무력화를 방지하기 위한 설계다.

---

**문제 5.**  
회사가 세 종류의 파트너(Premium: 1000 RPS, Standard: 100 RPS, Free: 10 RPS)에게 차등 API 접근을 제공하려 한다. 가장 적절한 구성은?

A) 파트너별로 별도의 API Gateway REST API를 생성한다  
B) 세 개의 사용량 플랜을 만들고 각 파트너에게 API 키를 발급해 해당 플랜에 연결한다  
C) Lambda Authorizer에서 파트너 등급에 따라 다른 IAM 정책을 반환한다  
D) 스테이지를 세 개(premium, standard, free) 만들고 각각 다른 스로틀링을 설정한다

**정답: B**  
사용량 플랜은 정확히 이 목적을 위해 설계됐다. 각 등급의 스로틀링(RPS, 버스트)과 할당량(일/주/월 한도)을 별도 플랜으로 정의하고, 각 파트너의 API 키를 해당 플랜에 연결하면 된다. 하나의 API와 스테이지로 모든 파트너를 수용할 수 있다.

---

**문제 6.**  
API Gateway CloudWatch 메트릭에서 `Latency`는 평균 3초이고 `IntegrationLatency`는 평균 0.1초다. 이 상황을 가장 정확하게 설명하는 것은?

A) Lambda 함수가 느려서 응답 시간이 길다  
B) DynamoDB 쿼리가 병목이다  
C) API Gateway 내부 처리(인증, 매핑, 캐시 등)에서 병목이 발생하고 있다  
D) 네트워크 레이턴시가 높다

**정답: C**  
`Latency(3초) - IntegrationLatency(0.1초) = 2.9초`가 API Gateway 내부에서 소비된다. Lambda Authorizer 호출, 요청/응답 매핑(VTL), 캐시 처리 등이 원인일 수 있다. IntegrationLatency가 짧다는 것은 백엔드(Lambda, DynamoDB)는 빠르다는 의미다.

---

**문제 7.**  
HTTP API에서 Cognito 사용자 인증을 구현해야 한다. REST API의 Cognito User Pool Authorizer를 그대로 쓸 수 없다. HTTP API에서 올바른 방법은?

A) Lambda Authorizer만 사용 가능하다  
B) JWT Authorizer를 설정하고 Cognito User Pool의 issuer URL과 audience를 지정한다  
C) HTTP API는 인증을 지원하지 않는다  
D) Cognito Identity Pool을 통해 IAM 인증으로 전환한다

**정답: B**  
HTTP API의 JWT Authorizer는 OIDC/OAuth 2.0 표준을 따르는 모든 공급자(Cognito, Auth0, Okta 등)를 지원한다. Cognito를 사용할 때는 `issuer`에 `https://cognito-idp.{region}.amazonaws.com/{userPoolId}`를, `audience`에 앱 클라이언트 ID를 지정한다. REST API의 Cognito User Pool Authorizer와 기능적으로 동일하지만 설정 방식이 다르다.
