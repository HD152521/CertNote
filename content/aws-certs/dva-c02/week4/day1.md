# Day 16 - API Gateway: REST API 기초

📅 날짜: 2026년 6월 7일 (일요일)  
🎯 주제: Amazon API Gateway REST API  
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- Amazon API Gateway의 개념과 REST API 구조를 이해한다
- 리소스, 메서드, 스테이지의 관계를 설명할 수 있다
- API Gateway의 배포(Deployment)와 스테이지를 구성한다

---

## 📖 이론 내용

### 1. Amazon API Gateway란?

API Gateway는 개발자가 API를 생성, 배포, 관리할 수 있는 완전 관리형 서비스입니다. 백엔드(Lambda, HTTP, AWS 서비스)에 대한 "현관문" 역할을 합니다.

**API 유형:**
- **REST API**: 기능이 가장 풍부, 모든 기능 지원
- **HTTP API**: 더 빠르고 저렴, 일부 기능만 지원
- **WebSocket API**: 양방향 실시간 통신

### 2. REST API 핵심 개념

#### 리소스 (Resource)
URL 경로로 표현되는 API 엔드포인트:
```
/users           (사용자 리소스)
/users/{userId}  (특정 사용자, 경로 매개변수)
/users/{userId}/orders  (중첩 리소스)
```

#### 메서드 (Method)
리소스에 대한 HTTP 동사:
- GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS

#### 통합 (Integration)
메서드가 호출하는 백엔드:
- Lambda 함수
- HTTP 엔드포인트
- AWS 서비스 (DynamoDB, S3 등)
- Mock (테스트용)

#### 스테이지 (Stage)
API 배포 환경:
```
dev    → 개발 환경
staging → 스테이징 환경
prod   → 프로덕션 환경
```

**스테이지 변수:**
```javascript
// stageVariables를 이용한 환경별 Lambda 함수 호출
// 스테이지: dev → Lambda 별칭: dev
// 스테이지: prod → Lambda 별칭: prod
arn:aws:lambda:${stageVariables.region}:123:function:MyFunc:${stageVariables.lambdaAlias}
```

### 3. API Gateway 요청/응답 흐름

```
클라이언트 요청
    |
    v
[메서드 요청]     (인증, 파라미터 검증)
    |
    v
[통합 요청]      (요청 변환, 백엔드 호출)
    |
    v
[백엔드]         (Lambda, HTTP 등)
    |
    v
[통합 응답]      (응답 변환)
    |
    v
[메서드 응답]    (HTTP 상태 코드, 헤더)
    |
    v
클라이언트 응답
```

### 4. 배포 (Deployment)

- API 변경 사항을 스테이지에 배포
- 배포 없이는 변경 사항이 적용되지 않음
- 각 배포는 스냅샷으로 롤백 가능

---

## 🧠 알아두면 좋은 심화 이론

### 엔드포인트 유형 3종 비교 (시험 빈출)

| 유형 | 동작 | 사용 사례 |
|------|------|-----------|
| **Edge-Optimized** | CloudFront 엣지 경유 | 글로벌 사용자 |
| **Regional** | 리전 직접 호출 | 같은 리전 클라이언트 (Lambda, EC2) |
| **Private** | VPC 내부에서만 접근 (Interface Endpoint) | 내부 API |

> ⚠️ **함정**: Edge-Optimized는 CloudFront 사용하지만, **CloudFront 콘솔에는 안 보임**. AWS 관리형. 별도 CloudFront 만들고 싶으면 **Regional + 자체 CloudFront** 패턴 사용.

### API 유형 3종 핵심 비교 (시험 핵심)

| 항목 | REST API | HTTP API | WebSocket API |
|------|----------|----------|----------------|
| 가격 | 비쌈 | **70% 저렴** | 메시지·연결 시간 과금 |
| 지연 시간 | 보통 | **낮음** | - |
| 통신 | 요청-응답 | 요청-응답 | 양방향 |
| 권한 부여 | IAM/Lambda/Cognito | IAM/Lambda/**JWT 내장** | IAM/Lambda |
| API 키·사용량 플랜 | ✅ | ❌ | ❌ |
| 캐싱 | ✅ | ❌ | - |
| 요청 검증 (Model) | ✅ | ❌ | ❌ |
| WAF 통합 | ✅ | ❌ | ❌ |
| X-Ray | ✅ | ❌ | ❌ |
| 사용자 도메인 | ✅ | ✅ | ✅ |
| 비공개 통합 (VPC Link) | ✅ NLB | ✅ ALB/NLB/Cloud Map | ❌ |
| Edge-Optimized | ✅ | ❌ Regional만 | ❌ Regional만 |

> 💡 **시험 키워드 → 선택**:
> - "비용 최소화 + 단순 Lambda 호출" → **HTTP API**
> - "API 키·사용량 플랜·WAF" → **REST API**
> - "실시간 채팅" → **WebSocket API**

### Custom Domain (사용자 도메인) 설정

```
api.mycompany.com (Route 53 A 레코드)
        ↓
Custom Domain Name (API GW에 등록)
        ↓ Base Path Mapping
[ /v1   → REST API "main" stage "prod" ]
[ /beta → HTTP API "beta" stage "$default" ]
```

| 도메인 유형 | 인증서 위치 | 비고 |
|-----------|------------|------|
| **Edge-Optimized** | `us-east-1`의 ACM | CloudFront 강제 |
| **Regional** | **각 리전의 ACM** | 인증서 발급 위치 주의 |

> ⚠️ **함정**: Edge-Optimized 도메인은 ACM 인증서를 **반드시 us-east-1**에서 발급해야 함. CloudFront 동일 제약. 시험에서 "도메인이 동작 안 함" 시나리오 → 인증서 리전 확인.

### OpenAPI(Swagger) Import / Export

- REST API와 HTTP API 모두 OpenAPI 3.0 import/export 지원
- 시험 시나리오: "API 정의를 코드로 관리" → OpenAPI YAML + CI/CD

### 스테이지 변수 활용 패턴

```
Lambda ARN: arn:aws:lambda:region:acc:function:f:${stageVariables.alias}

스테이지 dev  → alias=dev  → Lambda v$LATEST
스테이지 prod → alias=prod → Lambda v3 (별칭이 가리킴)
```

스테이지 변수 → HTTP 통합 URL, AWS 서비스 ARN, Lambda alias 모두 동적 치환 가능.

### Canary 배포 (REST API 내장 기능)

REST API 스테이지에 **카나리** 활성화 → 새 배포의 일부 트래픽만 카나리로 보내고, 측정 후 전체 승격.

```bash
aws apigateway update-stage \
  --rest-api-id abc --stage-name prod \
  --patch-operations 'op=replace,path=/canarySettings/percentTraffic,value=10'
```

### 가격 모델 핵심 (시험 가끔)

| API 유형 | 요금 |
|----------|------|
| REST API | $3.50/100만 호출 |
| HTTP API | $1.00/100만 호출 (≈70% ↓) |
| WebSocket | $1.00/100만 메시지 + 분당 연결 시간 |
| 캐싱 | 0.5~237 GB 시간당 추가 |

### 관련 서비스 Cross-Reference

- **Lambda 통합** → [Week 3]
- **Cognito 권한 부여자** → [Week 9 Day 3]
- **CloudFront ↔ Edge-Optimized 엔드포인트**
- **WAF ↔ REST API** → [Week 9 Day 4]
- **CloudFormation / SAM** → [Week 12 Day 5]

---

## 아키텍처 다이어그램

```
API Gateway REST API 구조
================================

[API: MyShopAPI]
    |
    +-- [리소스: /products]
    |       |
    |       +-- GET  → Lambda (상품 목록)
    |       +-- POST → Lambda (상품 생성)
    |
    +-- [리소스: /products/{productId}]
    |       |
    |       +-- GET    → Lambda (상품 조회)
    |       +-- PUT    → Lambda (상품 수정)
    |       +-- DELETE → Lambda (상품 삭제)
    |
    +-- [리소스: /orders]
            |
            +-- GET  → Lambda (주문 목록)
            +-- POST → DynamoDB (직접 통합)

배포 구조:
[API 정의] → [배포 1] → [스테이지: dev]
                         URL: https://xyz.execute-api.ap-northeast-2.amazonaws.com/dev
           → [배포 2] → [스테이지: prod]
                         URL: https://xyz.execute-api.ap-northeast-2.amazonaws.com/prod
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **배포 필수**: API 변경 후 스테이지에 배포해야 적용됨
2. ⭐ **스테이지 변수**: 환경별 백엔드 엔드포인트 분리
3. ⭐ **REST API vs HTTP API**: HTTP API가 더 빠르고 저렴 (기능은 적음)
4. ⭐ **엔드포인트 유형**: 엣지 최적화(CloudFront), 리전, 프라이빗(VPC)
5. ⭐ **사용자 지정 도메인**: ACM 인증서 + 사용자 정의 도메인 설정 가능

---

## 💻 실제 예시

```bash
# REST API 생성
aws apigateway create-rest-api \
  --name "MyShopAPI" \
  --description "쇼핑몰 API" \
  --endpoint-configuration types=REGIONAL

# 리소스 생성
ROOT_ID=$(aws apigateway get-resources \
  --rest-api-id abc123 \
  --query 'items[0].id' --output text)

aws apigateway create-resource \
  --rest-api-id abc123 \
  --parent-id $ROOT_ID \
  --path-part products

# 메서드 생성 (GET /products)
aws apigateway put-method \
  --rest-api-id abc123 \
  --resource-id res123 \
  --http-method GET \
  --authorization-type NONE

# Lambda 통합 설정
aws apigateway put-integration \
  --rest-api-id abc123 \
  --resource-id res123 \
  --http-method GET \
  --type AWS_PROXY \
  --integration-http-method POST \
  --uri "arn:aws:apigateway:ap-northeast-2:lambda:path/2015-03-31/functions/arn:aws:lambda:ap-northeast-2:123:function:GetProducts/invocations"

# 스테이지에 배포
aws apigateway create-deployment \
  --rest-api-id abc123 \
  --stage-name prod \
  --stage-description "프로덕션 스테이지"
```

---

## 📝 연습 문제

**문제 1.** API Gateway에서 API 변경 사항을 적용하려면?

A) API를 재생성해야 한다  
B) 스테이지에 새로운 배포를 생성해야 한다  
C) AWS 지원팀에 요청해야 한다  
D) 변경 사항은 자동으로 적용된다  

**정답: B** - API Gateway에서 변경 사항은 스테이지에 배포(Deployment)해야 적용됩니다.

---

**문제 2.** API Gateway 스테이지 변수의 용도는?

A) API 인증 설정  
B) 환경별로 다른 백엔드 엔드포인트 참조  
C) 요청 데이터 변환  
D) 응답 캐싱 설정  

**정답: B** - 스테이지 변수를 사용하면 dev/staging/prod 스테이지에서 각각 다른 Lambda 함수나 HTTP 엔드포인트를 가리킬 수 있습니다.

---

**문제 3.** REST API와 HTTP API의 차이점으로 올바른 것은?

A) HTTP API가 더 많은 기능을 제공한다  
B) REST API가 더 저렴하다  
C) HTTP API가 더 빠르고 저렴하지만 기능이 적다  
D) REST API는 WebSocket을 지원하고 HTTP API는 지원하지 않는다  

**정답: C** - HTTP API는 REST API보다 빠르고 저렴하지만, 리소스 정책, 사용량 플랜, API 키 등 일부 기능이 없습니다.

---

**문제 4.** API Gateway에서 CloudFront를 통해 글로벌 캐싱을 사용하는 엔드포인트 유형은?

A) 리전 엔드포인트  
B) 프라이빗 엔드포인트  
C) 엣지 최적화 엔드포인트  
D) 내부 엔드포인트  

**정답: C** - 엣지 최적화 엔드포인트는 CloudFront를 통해 글로벌로 배포되어 전 세계 사용자에게 낮은 지연 시간을 제공합니다.

---

**문제 5.** API Gateway 리소스에서 경로 매개변수를 사용하는 올바른 형식은?

A) /users/[userId]  
B) /users/{userId}  
C) /users/:userId  
D) /users/$userId  

**정답: B** - API Gateway에서 경로 매개변수는 중괄호 {} 안에 변수명을 넣는 형식으로 정의합니다.

---

## 📌 오늘의 요약

1. API Gateway는 백엔드에 대한 관리형 API 게이트웨이로 Lambda, HTTP, AWS 서비스와 통합 가능하다
2. 구성 요소: 리소스(URL 경로), 메서드(HTTP 동사), 통합(백엔드), 스테이지(환경)
3. API 변경 후 반드시 스테이지에 배포해야 적용됨
4. 스테이지 변수로 환경별 다른 백엔드를 참조할 수 있음
5. HTTP API가 REST API보다 빠르고 저렴하지만 사용량 플랜, API 키 등 기능 부재
