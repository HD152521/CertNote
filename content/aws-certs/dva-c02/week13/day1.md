# Day 1 - 최종 복습 1: IAM, EC2, Lambda, API Gateway

📅 날짜: 2026년 8월 9일 (일요일)  
🎯 주제: 핵심 서비스 최종 복습 1  
⏱️ 학습 시간: 약 120분

---

## 🎯 학습 목표

- IAM, EC2, Lambda, API Gateway의 시험 핵심 사항을 최종 정리한다
- 자주 나오는 시험 문제 유형을 파악한다

---

## 📖 최종 핵심 정리

### IAM 핵심 암기
```
정책 평가: Explicit Deny > Implicit Deny > Allow
STS AssumeRole: 교차 계정 접근, 임시 자격 증명
IAM 역할 vs 사용자: 역할은 임시, 사용자는 영구
SCP: 조직 단위 권한 경계, Deny 정책만 가능
권한 경계: IAM 사용자/역할의 최대 권한 제한
```

### EC2 핵심 암기
```
구매 옵션: 온디맨드 > 예약(72%절감) > 스팟(90%절감)
EBS gp3: SSD, 3000 IOPS 기본
EBS io2: 최고 성능 SSD, 멀티 Attach
인스턴스 스토어: 임시, 재부팅 시 유지, 종료 시 삭제
AMI: 리전 범위, 다른 리전 복사 가능
ALB: Layer 7, URL/호스트 기반 라우팅
NLB: Layer 4, 정적 IP, 초고성능
ASG 스케일링: 타겟 추적, 단계, 단순, 예약, 예측
```

### Lambda 핵심 암기
```
메모리: 128MB ~ 10240MB
타임아웃: 최대 15분
임시 스토리지: /tmp 512MB ~ 10GB
동시성 = 초당 요청 수 × 평균 실행 시간
Cold Start: 새 실행 환경, Provisioned Concurrency로 방지
예약된 동시성 = 0: 완전 비활성화
비동기 재시도: 최대 2회, DLQ 또는 Destinations
레이어: 최대 5개, /opt 디렉터리, 250MB 합계
```

### API Gateway 핵심 암기
```
통합 유형: AWS_PROXY(Lambda Proxy), AWS, HTTP, MOCK
Lambda Proxy 응답: {statusCode, headers, body}
캐싱: 기본 TTL 300초, Cache-Control: max-age=0으로 무효화
스로틀링 초과: HTTP 429
Cognito Authorizer: JWT 자동 검증
Lambda Authorizer: 커스텀 인증, 결과 캐시 기본 300초
HTTP API: REST보다 70% 저렴, 사용 계획/캐시 미지원
WebSocket: $connect, $disconnect, $default
```

---

## 🧠 도메인 1 (개발 32%) 시험 직전 압축 정리

### 자주 출제되는 함정 - 도메인 1

| 함정 | 정답 |
|------|------|
| "Lambda 최대 메모리?" | **10,240 MB** |
| "Lambda 최대 타임아웃?" | **15분 (900초)** |
| "Lambda 컨테이너 이미지 최대?" | **10 GB** |
| "Lambda Layer 최대 개수?" | **5개** |
| "ZIP 직접 업로드 최대?" | **50 MB** |
| "/tmp 최대?" | **10 GB** |
| "Lambda 동시성 기본 한도?" | **1,000 / 리전** |
| "비동기 재시도 횟수?" | **2회** (1분, 2분) |
| "Provisioned Concurrency가 가리키는 것?" | **별칭 또는 버전** ($LATEST 불가) |
| "SnapStart 지원 런타임?" | **Java, Python, .NET** |
| "AssumeRole 최대 세션?" | **12시간** |
| "Role Chaining 최대?" | **1시간** |
| "STS GetSessionToken 최대?" | **36시간** |
| "AssumeRole 첫 호출 토큰 만료?" | **1시간 (기본)** |

### IAM 정책 평가 정확히 (시험 매우 빈출)

```
1. 명시적 Deny (어디든) → 거부
2. SCP (Organizations) → 미허용 시 거부
3. 리소스 기반 정책 (S3/SQS/Lambda 등) → 허용이면 OK
4. 자격 증명 정책 (IAM)
5. 권한 경계 → 범위 안이어야 함
6. 세션 정책 (AssumeRole 시)
→ 모두 충족 시 허용
```

### Lambda 동시성 4종 (정확히)

| 종류 | 단위 | 설정 |
|------|------|------|
| **계정 동시성 한도** | 리전 전체 | 기본 1,000 |
| **버스트 한도** | 즉시 사용 가능 | 500/1000/3000 (리전별) + 분당 +500 |
| **예약 동시성** | 함수당 상한 | 무료 |
| **프로비저닝된 동시성** | 버전/별칭 | 시간당 과금 |

### API Gateway 인증 5종 (외워두기)

1. **None** — 공개
2. **IAM (SigV4)** — AWS 자격증명
3. **Lambda Authorizer (TOKEN)** — JWT, OAuth 검증
4. **Lambda Authorizer (REQUEST)** — 다중 헤더 검증
5. **Cognito User Pool Authorizer** — JWT 자동
6. **JWT Authorizer (HTTP API 전용)** — OIDC

### EC2 빈출 함정

- AMI는 **리전 종속**
- EBS는 **AZ 종속**
- HDD(st1/sc1) 부팅 볼륨 **불가**
- 인스턴스 스토어는 **stop/terminate 시 소멸** (reboot은 유지)
- IMDSv2 토큰 방식 강제 권장
- SG = Stateful, NACL = Stateless

---

## 🔬 암기표를 "이야기"로 다시 엮기: 요청 하나가 지나가는 길

위의 암기표는 시험 직전에 눈으로 훑기 좋지만, 표만 외우면 시나리오 문제에서 무너진다. DVA-C02의 도메인 1(개발 32%)은 "숫자를 아느냐"보다 "이 숫자가 왜 그 자리에 있느냐"를 묻는다. 그래서 복습의 마지막 단계는 흩어진 숫자들을 **요청 하나가 지나가는 경로** 위에 다시 배치하는 것이다.

```
                          [ IAM / STS ] ← 모든 화살표에 개입
                                │
   (1)            (2)           │          (3)              (4)
[클라이언트] ──▶ [API Gateway] ──▶ [Lambda 실행 환경] ──▶ [DynamoDB/S3/RDS]
                   │  │              │      │
                   │  │              │      └─ taskRole격: 함수의 실행 역할
                   │  └─ 캐시(TTL 300초) · 스로틀(429) · Authorizer(캐시 300초)
                   └─ 통합 타임아웃 기본 29초 ─┐
                                              └─ Lambda 타임아웃(최대 900초)보다 짧다!

   (1) 인증: None / IAM SigV4 / Lambda Authorizer / Cognito / JWT
   (2) 변환: AWS_PROXY는 요청 전체를 event로, AWS는 매핑 템플릿으로
   (3) 실행: INIT(콜드) → INVOKE(웜) → SHUTDOWN
   (4) 권한: 함수의 실행 역할(execution role)이 곧 앱의 AWS 권한
```

이 그림 하나에 시험에 나오는 함정 대부분이 걸려 있다. 예컨대 "Lambda 타임아웃은 15분인데 API Gateway 뒤에 두면 왜 29초 넘게 못 쓰는가"는 (2)와 (3) 사이의 **경계에서 더 짧은 제한이 이긴다**는 원리를 묻는 문제다. 동기 경로에서는 언제나 **가장 짧은 타임아웃이 실질 상한**이 된다. 오래 걸리는 작업은 API Gateway에서 즉시 202를 반환하고 SQS·Step Functions로 넘기는 비동기 설계로 바꿔야 한다 — 이것이 도메인 1과 도메인 3(배포)을 잇는 단골 시나리오다.

> 💡 **관련 이론**: "경계에서 더 짧은 제한이 이긴다"는 분산 시스템의 **타임아웃 예산(timeout budget)** 개념이다. 클라이언트 → 게이트웨이 → 함수 → DB로 이어지는 호출 사슬에서, 각 단계의 타임아웃은 바깥이 안쪽보다 길어야 의미가 있다. 안쪽이 더 길면 바깥이 먼저 끊어지고, 안쪽은 이미 끊긴 요청을 계속 처리하며 자원을 태운다(고아 작업). 반대로 안쪽이 짧으면 실패가 명확한 에러로 바깥에 전달된다. AWS SDK의 기본 재시도와 함께 보면 더 분명하다 — 바깥에서 재시도까지 하면 실질 소요 시간은 `타임아웃 × 재시도 횟수`로 부풀어, 게이트웨이 한도를 순식간에 넘긴다.

---

## ⚙️ Lambda 실행 환경 생명주기: Cold Start가 정확히 어디서 생기는가

"Cold Start는 나쁘다, Provisioned Concurrency로 없앤다"까지는 누구나 안다. 시험이 파고드는 지점은 **핸들러 안과 밖의 코드가 서로 다른 생명주기에 산다**는 사실이다.

```
[INIT 단계] — 콜드 스타트에서만 실행 (과금·타임아웃 취급이 다름)
  1. 코드 다운로드 (ZIP 또는 컨테이너 이미지)
  2. 실행 환경(마이크로VM) 생성 · 런타임 부팅
  3. 핸들러 "바깥" 코드 실행  ← SDK 클라이언트 생성, DB 커넥션, 설정 로드

[INVOKE 단계] — 호출마다 실행
  4. handler(event, context) 호출

[SHUTDOWN 단계] — 환경이 회수될 때
  5. 확장(extension)에 종료 신호
```

```python
import os
import json
import boto3

# ── INIT 단계에서 딱 한 번 실행되는 영역 ──────────────────────
# 콜드 스타트 비용을 여기서 한 번만 치르고, 이후 웜 호출은 재사용한다.
TABLE_NAME = os.environ["TABLE_NAME"]
dynamodb = boto3.resource("dynamodb")
table = dynamodb.Table(TABLE_NAME)

def handler(event, context):
    # ── INVOKE 단계: 호출마다 실행되는 영역 ──────────────────
    body = json.loads(event.get("body") or "{}")
    user_id = body.get("userId")

    if not user_id:
        return {
            "statusCode": 400,
            "headers": {"Content-Type": "application/json"},
            "body": json.dumps({"message": "userId is required"}),
        }

    table.put_item(Item={"PK": f"USER#{user_id}", "SK": "PROFILE", **body})

    return {
        "statusCode": 201,
        "headers": {"Content-Type": "application/json"},
        "body": json.dumps({"userId": user_id}),
    }
```

핸들러 안에서 `boto3.resource(...)`를 만들면 호출할 때마다 클라이언트 초기화 비용(자격 증명 조회, 엔드포인트 해석, TLS 준비)을 다시 낸다. 반대로 핸들러 밖에 두면 **같은 실행 환경이 살아 있는 동안** 재사용된다. 시험에서 "Lambda 지연을 줄이는 코드 수준 조치"를 물으면 답은 거의 항상 "재사용 가능한 초기화를 핸들러 밖으로 옮긴다"이다.

> 🔍 **더 깊이**: 실행 환경이 재사용된다는 사실은 성능 이득인 동시에 **상태 오염(state leakage)** 의 원인이기도 하다. 전역 변수에 이전 호출의 데이터를 남기면 다음 호출이 그 값을 본다 — 같은 사용자 요청이 아닌데도 이전 사용자의 캐시를 읽는 버그가 여기서 나온다. `/tmp`도 마찬가지로 같은 환경 안에서는 유지되므로, 임시 파일을 지우지 않으면 512MB 기본 용량이 차서 `No space left on device`가 뜬다. 그래서 실무 원칙은 "**전역에는 불변·무상태 자원만, 요청별 데이터는 지역 변수로**"다. 이 원칙은 Lambda 함수 간에 메모리를 공유할 수 없다는 사실(따라서 공유 상태는 DynamoDB·ElastiCache 같은 외부 저장소로)과 한 짝이다.

### 호출 모델 3종 — 재시도·실패 처리가 완전히 다르다

| 구분 | 동기(RequestResponse) | 비동기(Event) | 이벤트 소스 매핑(폴링) |
|------|----------------------|--------------|----------------------|
| 대표 호출자 | API Gateway, ALB, SDK 직접 호출 | S3 이벤트, SNS, EventBridge | SQS, Kinesis, DynamoDB Streams |
| 페이로드 한도 | **6 MB** | **256 KB** | 배치 단위(서비스별) |
| 실패 시 재시도 | **Lambda가 재시도하지 않음** (호출자 책임) | **최대 2회** (약 1분, 2분 간격) | 이벤트 소스 설정에 따름 |
| 실패 최종 처리 | 호출자에게 에러 반환 | DLQ 또는 Lambda Destinations | 큐/스트림에 남거나 DLQ |
| 순서 | 해당 없음 | 보장 없음 | 샤드·메시지 그룹 단위 보장 |

이 표를 외우는 대신 **"누가 메시지를 쥐고 있느냐"** 로 이해하면 잊히지 않는다. 동기 호출에서는 호출자가 응답을 기다리며 쥐고 있으니 재시도도 호출자 몫이다. 비동기 호출에서는 Lambda 서비스가 이벤트를 큐에 받아 쥐고 있으니 Lambda가 재시도한다. 이벤트 소스 매핑에서는 SQS·Kinesis가 원본을 쥐고 있으니, 함수가 실패하면 메시지는 그냥 원본에 남아 가시성 타임아웃 뒤 다시 나타난다.

> ⚠️ **함정**: "Lambda가 실패하면 항상 2번 재시도한다"는 흔한 오해다. **동기 호출에서는 Lambda가 재시도하지 않는다.** API Gateway 뒤의 함수가 에러를 내면 그대로 502가 나가고, 재시도할지는 클라이언트가 정한다. 시험에서 "API Gateway → Lambda 경로에서 일시적 오류를 견디게 하려면?"의 답이 "Lambda 재시도 설정"이 아니라 "SQS를 사이에 두는 비동기화" 또는 "클라이언트 지수 백오프"인 이유다.

---

## 🔐 IAM을 코드로 보기: 신뢰 정책과 권한 정책은 다른 질문에 답한다

IAM 역할에는 두 종류의 JSON이 붙는데, 둘을 헷갈리면 "역할은 만들었는데 아무것도 안 된다"는 상황에 빠진다.

- **신뢰 정책(Trust Policy)**: "**누가** 이 역할을 수임할 수 있는가" — 역할의 문(門)
- **권한 정책(Permissions Policy)**: "이 역할이 **무엇을** 할 수 있는가" — 역할의 손

```json
// 신뢰 정책 — Lambda 서비스가 이 역할을 수임하도록 허용
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": { "Service": "lambda.amazonaws.com" },
      "Action": "sts:AssumeRole"
    }
  ]
}
```

```json
// 권한 정책 — 최소 권한으로 좁힌 실행 역할
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "WriteOwnLogs",
      "Effect": "Allow",
      "Action": [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "arn:aws:logs:ap-northeast-2:123456789012:log-group:/aws/lambda/my-func:*"
    },
    {
      "Sid": "AccessOwnTableOnly",
      "Effect": "Allow",
      "Action": ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"],
      "Resource": "arn:aws:dynamodb:ap-northeast-2:123456789012:table/Orders"
    },
    {
      "Sid": "DenyOutsideOffice",
      "Effect": "Deny",
      "Action": "*",
      "Resource": "*",
      "Condition": {
        "Bool": { "aws:SecureTransport": "false" }
      }
    }
  ]
}
```

세 번째 문장이 중요한 시범이다. 명시적 `Deny`는 다른 어떤 `Allow`보다 먼저 이긴다 — 관리자 권한이 붙어 있어도 이 조건에 걸리면 거부된다. 암기표의 "Explicit Deny > Implicit Deny > Allow"가 코드로는 이렇게 생겼다.

교차 계정 접근을 CLI로 확인하는 흐름은 다음과 같다.

```bash
# 1) 대상 계정 역할 수임 — 임시 자격 증명 3종을 받는다
aws sts assume-role \
  --role-arn arn:aws:iam::999988887777:role/CrossAccountReadOnly \
  --role-session-name dev-debug \
  --external-id "unique-shared-secret" \
  --duration-seconds 3600

# 2) 반환된 AccessKeyId / SecretAccessKey / SessionToken을 환경에 적용한 뒤
aws sts get-caller-identity          # 내가 지금 "누구"인지 확인 (디버깅 1순위)

# 3) 함수 권한을 실제로 시험해 보기
aws lambda invoke \
  --function-name my-func \
  --payload '{"body":"{\"userId\":\"U001\"}"}' \
  --cli-binary-format raw-in-base64-out \
  response.json
```

> 📚 **사례**: 서드파티 SaaS에 자기 계정 읽기 권한을 주는 흔한 구성에서, 신뢰 정책에 `ExternalId` 조건을 빼는 실수가 반복된다. 이 경우 그 SaaS가 다른 고객의 요청을 받아 내 역할을 수임해도 AWS는 막을 방법이 없다 — 이것이 **혼동된 대리인(Confused Deputy)** 문제다. `ExternalId`는 "그 SaaS와 나만 아는 값"을 조건으로 걸어, 제3자가 SaaS를 시켜 내 계정을 건드리는 경로를 끊는다. 시험에서 "서드파티에 역할을 제공할 때 반드시 포함할 것"의 답은 언제나 `ExternalId`이며, `sts:AssumeRole` 자체의 권한 축소가 아니다.

---

## 🚪 API Gateway: 통합 유형과 응답 계약

Lambda Proxy(`AWS_PROXY`)는 "요청 전체를 event로 넣어주고, 응답 형식은 네가 맞춰라"는 계약이다. 이 계약을 어기면 함수는 성공했는데 클라이언트는 502를 본다.

```javascript
// Node.js — Lambda Proxy 통합에서 지켜야 하는 응답 계약
export const handler = async (event) => {
  // event에는 원 요청이 통째로 들어온다
  const method = event.requestContext?.http?.method ?? event.httpMethod;
  const orderId = event.pathParameters?.orderId;
  const page = event.queryStringParameters?.page ?? "1";
  const auth = event.headers?.authorization;

  try {
    const order = await getOrder(orderId);
    if (!order) {
      return respond(404, { message: "order not found" });
    }
    return respond(200, { order, page });
  } catch (err) {
    console.error("getOrder failed", { orderId, err });   // CloudWatch Logs로
    return respond(500, { message: "internal error" });   // 스택 트레이스 노출 금지
  }
};

// statusCode / headers / body(문자열) 세 가지가 계약의 전부다
const respond = (statusCode, payload) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),   // 객체를 그대로 넣으면 502가 난다
});
```

`body`에 객체를 그대로 넣거나 `statusCode`를 빠뜨리면 API Gateway가 응답을 해석하지 못하고 **502 Bad Gateway**를 만든다. "함수 로그에는 성공인데 클라이언트는 502"라는 증상의 1순위 원인이 바로 이것이다.

### REST API vs HTTP API — 어디서 갈리는가

| 항목 | REST API | HTTP API |
|------|----------|----------|
| 비용 | 기준 | 약 **70% 저렴** |
| 지연 | 상대적으로 큼 | 더 낮음 |
| 사용 계획·API 키 | ✅ | ❌ |
| 응답 캐싱 | ✅ | ❌ |
| 요청 검증·매핑 템플릿 | ✅ | 제한적 |
| WAF 직접 연결 | ✅ | ❌ (CloudFront 등 경유) |
| JWT Authorizer | ❌ (Cognito Authorizer) | ✅ |
| 기본 검증 토큰 | Cognito Authorizer는 **ID 토큰** | JWT Authorizer는 **액세스 토큰** |

"단순 프록시 + 비용 최소화"면 HTTP API, "사용량 과금·캐싱·요청 검증·WAF"가 필요하면 REST API다. 시험에서 요구사항 목록에 **사용 계획(usage plan)이나 캐싱**이 한 줄이라도 들어 있으면 HTTP API는 즉시 오답이 된다.

### 에러 코드로 원인을 역추적하는 표

| 증상 | 어디서 나는가 | 대표 원인 |
|------|--------------|----------|
| `403 Missing Authentication Token` | API Gateway | 존재하지 않는 경로/메서드 호출 (경로 오타가 대부분) |
| `403 User is not authorized` | API Gateway/IAM | SigV4 서명은 맞지만 `execute-api:Invoke` 권한 없음 |
| `401 Unauthorized` | Authorizer | 토큰 만료·서명 불일치·잘못된 발급자 |
| `429 Too Many Requests` | API Gateway | 스테이지/사용 계획 스로틀 초과 |
| `502 Bad Gateway` | API Gateway | Lambda 응답이 `{statusCode, headers, body}` 계약 위반 |
| `504 Gateway Timeout` | API Gateway | 통합 타임아웃(기본 29초) 초과 |
| `Task timed out after N seconds` | Lambda | 함수 타임아웃 도달 — 대개 VPC 내 DB 응답 지연 |
| `TooManyRequestsException` | Lambda | 계정/함수 동시성 한도 초과(스로틀링) |
| `AccessDeniedException` | 대상 서비스 | 실행 역할의 권한 정책 누락 |
| `ResourceConflictException` | Lambda | 함수 업데이트가 진행 중일 때 또 업데이트 시도 |

이 표는 그대로 실무 디버깅 순서가 된다. **403/404 계열이면 게이트웨이 설정, 5xx면 통합 대상, AccessDenied면 IAM**이라는 세 갈래로 먼저 나누고 들어가면 원인 탐색 범위가 크게 줄어든다.

```bash
# 스로틀·에러를 지표로 먼저 확인 (로그를 뒤지기 전에)
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda --metric-name Throttles \
  --dimensions Name=FunctionName,Value=my-func \
  --start-time 2026-08-09T00:00:00Z --end-time 2026-08-09T12:00:00Z \
  --period 300 --statistics Sum

# 함수 단위 동시성 상한(예약 동시성) 확인·설정
aws lambda get-function-concurrency --function-name my-func
aws lambda put-function-concurrency --function-name my-func --reserved-concurrent-executions 50

# 별칭에 프로비저닝된 동시성 — $LATEST에는 붙일 수 없다
aws lambda put-provisioned-concurrency-config \
  --function-name my-func --qualifier prod \
  --provisioned-concurrent-executions 10
```

---

## 💽 EC2를 한 번 더: 경계를 묻는 문제들

EC2 영역에서 시험이 반복해서 묻는 것은 성능 수치가 아니라 **자원의 경계**다.

| 자원 | 경계 | 실무적 의미 |
|------|------|------------|
| AMI | **리전** | 다른 리전에 쓰려면 복사(copy) 필요 |
| EBS 볼륨 | **가용 영역(AZ)** | 다른 AZ로 옮기려면 스냅샷 → 새 AZ에 복원 |
| 스냅샷 | **리전**(S3에 저장) | AZ 이동·리전 복사의 매개체 |
| 보안 그룹 | **VPC** | 다른 VPC에서 재사용 불가, 상태 저장(Stateful) |
| NACL | **서브넷** | 상태 비저장(Stateless) — 인/아웃 규칙을 양쪽 다 열어야 함 |
| 탄력적 IP | **리전** | 계정·리전 단위 한도 존재 |

"EBS는 AZ 종속"이라는 한 줄이 곧 "EC2를 다른 AZ로 옮기는 절차"를 결정한다. 스냅샷을 떠서 대상 AZ에 볼륨을 만들고 붙이는 것 외에 방법이 없다. 마찬가지로 "AMI는 리전 종속"이 곧 "재해 복구를 위해 AMI를 DR 리전으로 복사해 둔다"는 운영 습관으로 이어진다.

인스턴스 메타데이터는 IMDSv2가 사실상 표준이다. 토큰을 먼저 받고 그 토큰으로 조회하는 2단계 구조라, SSRF로 메타데이터를 훔치는 고전적 공격 경로가 막힌다.

```bash
# IMDSv2 — 토큰을 먼저 발급받는다(PUT), 이후 헤더로 제시(GET)
TOKEN=$(curl -sX PUT "http://169.254.169.254/latest/api/token" \
  -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")

curl -s -H "X-aws-ec2-metadata-token: $TOKEN" \
  http://169.254.169.254/latest/meta-data/iam/security-credentials/
```

> ⚠️ **함정**: EC2에 액세스 키를 파일로 심는 구성은 시험에서 **언제나 오답**이다. 정답은 인스턴스 프로파일(IAM 역할)을 붙이고, SDK가 메타데이터에서 임시 자격 증명을 자동으로 받아 쓰게 하는 것이다. 같은 논리로 Lambda에는 실행 역할, ECS 태스크에는 taskRole이 답이다. "자격 증명을 코드·환경 변수·AMI에 넣는다"가 보기에 있으면 그 보기는 거의 확실히 함정이다.

> 📚 **사례**: 실무에서 "어제까지 잘 되던 Lambda가 오늘부터 간헐적으로 500"이라는 신고의 상당수는 코드 변경이 아니라 **동시성 벽**이다. 다른 팀이 같은 리전에서 대량 배치를 돌리며 계정 동시성 1,000을 잠식하면, 내 함수가 스로틀링(`TooManyRequestsException`)에 걸린다. 이때의 처방은 코드 최적화가 아니라 (1) 중요한 함수에 **예약 동시성**으로 몫을 확보하고, (2) 그 함수가 다른 함수를 굶기지 않도록 상한도 함께 정하는 것이다. 예약 동시성이 "보장"과 "상한"을 동시에 뜻한다는 점 — 이 이중성이 시험의 단골 포인트다.

---

## 정리하며

오늘 복습한 네 서비스는 따로 노는 암기 항목이 아니라 요청 하나가 지나가는 **한 줄의 경로**다. IAM은 그 경로의 모든 화살표에 개입하고, API Gateway는 인증·변환·보호(캐시·스로틀)를 담당하며, Lambda는 실행 환경의 생명주기 위에서 코드를 돌리고, EC2는 그 아래에서 자원의 경계(리전·AZ·VPC)를 규정한다. 숫자를 외울 때도 이 경로 위 어느 지점의 제약인지를 함께 붙여 두면, 시나리오 문제에서 "어느 층이 문제인가"를 먼저 가를 수 있다. 특히 **동기 경로에서는 가장 짧은 타임아웃이 이긴다**, **비동기만 Lambda가 재시도한다**, **명시적 Deny는 모든 Allow를 이긴다**, **자격 증명은 코드가 아니라 역할로** — 이 네 문장은 도메인 1 문제의 절반가량을 관통한다.

---

## 📝 최종 모의고사 - Part 1

**문제 1.** Lambda에서 Provisioned Concurrency가 해결하는 문제는?

A) 높은 비용  
B) Cold Start 지연  
C) 타임아웃 문제  
D) 메모리 부족  

**정답: B** - Provisioned Concurrency는 실행 환경을 미리 초기화하여 Cold Start 지연을 제거합니다.

---

**문제 2.** API Gateway에서 HTTP 429 오류의 의미는?

A) 인증 실패  
B) 요청 너무 많음 (스로틀링 초과)  
C) 서버 오류  
D) 리소스 없음  

**정답: B** - 429 Too Many Requests는 API Gateway 스로틀링 한계를 초과했을 때 반환됩니다.

---

**문제 3.** IAM 정책에서 Deny와 Allow가 충돌할 때?

A) Allow 우선  
B) Deny 우선  
C) 마지막 설정 우선  
D) 관리자 결정  

**정답: B** - IAM 정책 평가에서 명시적 Deny는 항상 Allow보다 우선합니다.

---

**문제 4.** EC2 인스턴스를 중지 후 재시작할 때 데이터가 삭제되는 스토리지는?

A) EBS gp3  
B) EBS io2  
C) 인스턴스 스토어  
D) EFS  

**정답: C** - 인스턴스 스토어는 임시 스토리지로 인스턴스 중지 또는 종료 시 데이터가 삭제됩니다.

---

**문제 5.** Lambda 함수 간 데이터를 공유하는 올바른 방법은?

A) Lambda 환경 변수에 저장  
B) /tmp에 저장  
C) DynamoDB, S3, ElastiCache 등 외부 스토리지 사용  
D) Lambda 메모리에 저장  

**정답: C** - Lambda 함수 간 데이터 공유는 DynamoDB, S3, ElastiCache 등 외부 스토리지를 사용해야 합니다. Lambda 인스턴스 간 메모리는 공유되지 않습니다.

---

**문제 6.** API Gateway에서 캐시를 즉시 무효화하는 방법은?

A) API 재배포  
B) 캐시 삭제 API 호출  
C) Cache-Control: max-age=0 헤더로 요청  
D) TTL을 0으로 설정  

**정답: C** - `Cache-Control: max-age=0` 헤더를 포함하여 요청하면 API Gateway가 백엔드에서 최신 응답을 가져옵니다.

---

**문제 7.** Lambda 레이어의 파일이 저장되는 위치는?

A) /var/runtime  
B) /opt  
C) /tmp  
D) /var/task  

**정답: B** - Lambda 레이어의 파일은 `/opt` 디렉터리에 마운트됩니다.

---

**문제 8.** 교차 계정 S3 접근을 위한 올바른 방법은?

A) IAM 사용자를 대상 계정에 생성  
B) STS AssumeRole로 대상 계정 역할 수임  
C) S3 퍼블릭 액세스 허용  
D) VPN 연결  

**정답: B** - STS AssumeRole을 사용하여 대상 계정의 역할을 수임하고 임시 자격 증명으로 S3에 접근합니다.

---

## 📌 오늘의 요약

1. IAM: Deny > Allow, STS로 임시 자격 증명, SCP로 조직 단위 제한
2. EC2: 구매 옵션, EBS 유형, 인스턴스 스토어(임시), ALB/NLB 차이
3. Lambda: 메모리/타임아웃 한계, Cold Start, 동시성, 레이어(/opt)
4. API Gateway: 통합 유형, 캐시, 스로틀링(429), Authorizer 유형
5. 공통 패턴: 서버리스 + 느슨한 결합 + 관리형 서비스 선택
