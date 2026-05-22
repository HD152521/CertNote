# Day 27 - API Gateway: REST / HTTP / WebSocket

📅 날짜: Week 6 (Day 2)
🎯 주제: API 관리 서비스
⏱️ 학습 시간: 약 90분

---

## 🎯 학습 목표

- REST / HTTP / WebSocket API 세 종류의 차이를 안다
- 인증·인가 옵션 4가지를 구분한다
- 캐싱·스로틀링·사용량 계획·스테이지 배포를 설명한다

---

## 🧩 사전 지식 (CS 기초)

- **REST**: 자원 중심 HTTP API. POST/GET/PUT/DELETE.
- **WebSocket**: 영구 양방향 연결. 채팅·실시간.
- **API 게이트웨이 패턴**: 클라이언트 ↔ 백엔드 다수 사이의 단일 진입점. 인증·라우팅·변환.
- **JWT**: 서명된 JSON 토큰. Cognito·OIDC가 발급.

---

## 📖 이론 내용

### 1. 세 종류 비교

| 항목 | REST | HTTP | WebSocket |
|------|------|------|------------|
| 비용 | 비쌈 | **저렴** | 별도 |
| 기능 | 풍부(매핑·캐싱·API 키·사용량) | 단순 + 빠름 | 양방향 영구 연결 |
| 인증 | IAM/Cognito/Lambda Authorizer/API Key | JWT(OIDC) / IAM / Lambda | IAM / Lambda |
| 통합 | Lambda / HTTP / AWS Service / Mock | Lambda / HTTP | Lambda / HTTP |
| Private | O (Endpoint) | O (VPC Link) | O |

> 일반 시나리오 = **HTTP API** (저렴·빠름). 복잡한 변환·캐싱·키 관리 필요 = **REST API**.

### 2. 인증·인가 옵션

| 옵션 | 사용 |
|------|------|
| **IAM** | SigV4 (AWS 클라이언트끼리) |
| **Cognito User Pool** | JWT 발급 |
| **Lambda Authorizer** | 토큰·정책 검증 커스텀 |
| **API Key + Usage Plan** | 키 발급·쿼터·요금제 |
| **JWT Authorizer (HTTP API만)** | Cognito 외 OIDC |

### 3. 스테이지·배포

- **Stage** (dev / prod / canary). 각 스테이지 별 URL.
- **Canary Release**: 트래픽 일부만 새 버전으로.
- **Stage Variables**로 Lambda alias 동적 매핑.

### 4. 캐싱 & 스로틀링

- **Cache**: 응답 캐싱(0.5~237GB). TTL 별도.
- **Throttling**: 계정/스테이지/메서드/사용량 단위.
- **Burst + Rate**.

### 5. 통합 유형

- **Lambda Proxy** (디폴트, 가장 흔함)
- **Lambda Non-Proxy** (매핑 템플릿 사용)
- **HTTP / HTTP Proxy** (외부 HTTP 백엔드)
- **AWS Service** (직접 DDB/Kinesis 등 호출)
- **Mock** (테스트용)

### 6. Private API & VPC Link

- **Private API**: VPC 내부에서만 호출(Interface Endpoint).
- **VPC Link**: API GW가 NLB(REST) / ALB·NLB(HTTP)를 통해 사설 백엔드 호출.

---

## 🧠 알아두면 좋은 심화 이론

| 항목 | 설명 | 시험 포인트 |
|------|------|-------------|
| **WAF + API Gateway** | REST/HTTP 모두 가능 | L7 보안 |
| **CORS** | 게이트웨이 단에서 처리 | 브라우저 호출 |
| **Edge / Regional / Private** | 엔드포인트 타입 3종 | 글로벌 vs 같은 리전 vs 사설 |
| **Mutual TLS (mTLS)** | 클라이언트 인증서 검증 | 파트너 API |
| **Response Compression** | gzip | 대역폭 ↓ |

> ⚠️ **함정**: "API 키 + 사용량 계획" → **REST API만**. HTTP API는 미지원.

> 💡 **암기 팁**: 단순·저렴 = HTTP / 풍부 = REST / 실시간 양방향 = WebSocket.

### 관련 서비스 Cross-Reference

- Lambda → Day 1
- Cognito → Week 8
- WAF → Week 8
- AppSync(GraphQL) → Day 3

---

## 🏗️ 아키텍처 다이어그램

```
[ 표준 서버리스 API ]

  Client → Route 53 → CloudFront → API GW (HTTP API)
                                       │
                       JWT Authorizer (Cognito) │
                                       ▼
                                   Lambda
                                       ├─ DynamoDB
                                       └─ S3 (Presigned URL 발급)

[ Private API + VPC Link ]

  EC2 (VPC) → API GW Private → VPC Link → NLB → ECS
```

---

## ⭐ 핵심 포인트 (시험 출제 빈도 높음)

1. ⭐ **HTTP API가 저렴·빠름** — 디폴트 선택.
2. ⭐ **API Key·사용량 계획**은 REST만.
3. ⭐ **WebSocket = 실시간 양방향**.
4. ⭐ **Canary Release**로 점진 배포.
5. ⭐ **Private API + VPC Link**가 사설 백엔드 표준.

---

## 💻 실제 예시 - AWS CLI

```bash
# HTTP API 만들기 (Lambda 통합)
aws apigatewayv2 create-api --name saa-http \
  --protocol-type HTTP --target arn:aws:lambda:...:function:saa-fn

# JWT Authorizer (Cognito)
aws apigatewayv2 create-authorizer --api-id abc \
  --name jwt-cognito --authorizer-type JWT \
  --identity-source '$request.header.Authorization' \
  --jwt-configuration Audience=clientid,Issuer=https://cognito-idp.ap-northeast-2.amazonaws.com/POOL

# Stage + Canary
aws apigatewayv2 create-stage --api-id abc --stage-name prod \
  --auto-deploy
```

---

## 📝 연습 문제

**문제 1.** 비용·성능 우선의 신규 마이크로서비스 API:

A) REST B) HTTP C) WebSocket D) GraphQL AppSync

**정답: B**.

---

**문제 2.** 파트너에게 API 키 + 요금제 부여:

A) HTTP API B) REST API + Usage Plan C) WebSocket D) Lambda URL

**정답: B**.

---

**문제 3.** 실시간 채팅:

A) REST B) HTTP C) WebSocket API D) ALB

**정답: C**.

---

**문제 4.** Cognito JWT 검증 + HTTP API:

A) Lambda Authorizer만 B) JWT Authorizer C) IAM D) API Key

**정답: B**.

---

**문제 5.** API GW가 VPC 안의 ECS 백엔드 호출:

A) Lambda Proxy B) VPC Link + NLB/ALB C) Direct Connect D) Public ALB

**정답: B**.

---

## 📌 오늘의 요약

1. HTTP API가 디폴트, REST는 풍부, WebSocket은 실시간.
2. 인증 = IAM/Cognito/Lambda/API Key/JWT.
3. Canary로 점진 배포, Stage Variables로 환경 매핑.
4. Private API + VPC Link로 사설 백엔드.
5. WAF + CORS + mTLS로 보안 보강.
