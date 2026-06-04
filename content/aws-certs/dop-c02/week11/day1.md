# Day 1 - X-Ray: 분산 추적의 인과 그래프와 Trace 모델의 깊은 이야기

모놀리식 시절의 디버깅은 스택 트레이스 한 장이면 끝났다. 함수가 함수를 부르고, 예외가 터지면 호출 스택이 위에서 아래로 한 줄씩 찍혔다. 그런데 그 모놀리스를 수십 개의 마이크로서비스로 쪼개고, API Gateway 뒤에 Lambda가 붙고, 그 Lambda가 다른 Lambda를 부르고, 그 사이에 DynamoDB와 SQS와 외부 HTTP API가 끼어드는 순간 "스택 트레이스"라는 개념 자체가 무너진다. 하나의 사용자 요청이 프로세스 경계를, 네트워크를, 비동기 큐를 넘나들며 흩어지기 때문이다. "이 요청이 왜 3초나 걸렸는가"라는 질문에 답하려면, 흩어진 작업 조각들을 다시 하나의 인과 사슬로 꿰어야 한다. 그 꿰는 일이 분산 추적(distributed tracing)이고, AWS X-Ray는 그 모델을 AWS 생태계 위에 구현한 것이다.

오늘은 X-Ray를 단순히 "Service Map 보는 도구"로 보지 않고, 그 밑에 깔린 인과 모델을 판다. Trace가 왜 트리(tree)가 아니라 방향성 비순환 그래프(DAG)에 가까운지, Trace ID가 어떻게 프로세스 경계를 넘어 컨텍스트를 전파하는지, X-Ray의 세그먼트 모델이 Google Dapper 논문에서 어떻게 유래했고 OpenTelemetry의 span 모델과 어떻게 다른지, Annotation과 Metadata의 인덱싱 차이가 검색 엔진의 역인덱스 비용과 어떻게 연결되는지를 본다. DOP 시험에서 X-Ray는 옵저버빌리티 도메인의 핵심이자, "마이크로서비스에서 어느 구간이 느린지 어떻게 찾나", "Lambda 체인의 병목을 어떻게 시각화하나", "추적 비용을 어떻게 줄이나" 같은 시나리오로 반복 출제된다.

## 분산 추적은 왜 태어났나 — Dapper에서 X-Ray까지

분산 추적의 역사는 2010년 구글이 발표한 **Dapper** 논문("Dapper, a Large-Scale Distributed Systems Tracing Infrastructure")에서 시작한다. 구글은 검색 쿼리 하나가 수천 대의 머신에 흩어진 수백 개 서비스를 거치는 환경에서 "어느 서비스가 느린가"를 알 방법이 없었다. Dapper는 이 문제를 풀기 위해 세 가지 핵심 발상을 도입했다. 첫째, 요청마다 고유한 **trace ID**를 부여하고 모든 하위 호출에 전파한다. 둘째, 각 작업 단위를 **span**으로 기록하고 부모 span ID를 참조해 인과 관계를 복원한다. 셋째, 모든 요청을 추적하면 너무 비싸므로 **샘플링**으로 일부만 수집한다.

X-Ray의 Trace/Segment/Subsegment 모델은 Dapper의 trace/span 모델을 AWS 용어로 옮긴 것이다. Dapper의 "trace"가 X-Ray의 "Trace", Dapper의 "span"이 X-Ray의 "Segment"(서비스 경계)와 "Subsegment"(서비스 내부 작업)로 두 단계로 나뉜다. 이 계보를 알면 X-Ray가 왜 이렇게 생겼는지, 그리고 왜 OpenTelemetry(Dapper의 또 다른 후손)와 개념적으로 호환되는지가 보인다.

```
Trace (1 사용자 요청 = 하나의 인과 그래프)
 ├─ Segment (서비스 A) — 하나의 서비스/리소스 경계의 작업
 │   ├─ Subsegment (DynamoDB GetItem) — 다운스트림 호출
 │   ├─ Subsegment (invoke Lambda B) — 원격 호출
 │   └─ Subsegment (business_logic) — 내부 코드 블록
 └─ Segment (서비스 B)
     └─ Subsegment (...)
```

> 💡 **관련 이론**: Dapper 논문이 정의한 분산 추적의 세 가지 설계 목표는 오늘날까지 모든 추적 시스템의 기준이다 — **low overhead**(추적이 본 서비스를 느리게 하면 안 됨), **application-level transparency**(개발자가 일일이 계측하지 않아도 됨, 즉 auto-instrumentation), **scalability**(구글 규모에서 동작). X-Ray의 SDK auto-patching(`patch_all()`이 boto3·requests를 자동 계측), 샘플링(overhead 제어), Daemon의 비동기 배치 전송(low overhead)은 정확히 이 세 목표를 구현한 것이다. Zipkin(트위터), Jaeger(Uber), OpenTelemetry(CNCF)도 모두 Dapper의 직계 후손이며, 같은 trace-span-context propagation 삼각형 위에 서 있다.

> 🔍 **더 깊이**: Trace는 흔히 "트리"로 그려지지만 엄밀히는 **DAG(방향성 비순환 그래프)**에 가깝다. 단순 동기 호출 체인이면 트리지만, 하나의 작업이 여러 다운스트림을 병렬로 호출하면(fan-out) 부모-자식이 1:N이 되고, 비동기 메시징에서는 한 메시지가 여러 컨슈머에 도달하거나(SQS fan-out via SNS) 배치로 묶여 여러 trace가 한 처리 단위에 모이는 **span link**가 생긴다. OpenTelemetry는 이를 위해 부모-자식 관계 외에 "link"라는 별도 엣지 타입을 둔다. X-Ray의 segment는 `parent_id`로 인과를 표현하되, 비동기 경계에서는 인과 사슬이 끊길 수 있다는 점이 실무의 함정이다 — SQS를 거치면 producer trace와 consumer trace가 자동으로 이어지지 않는 경우가 많아 trace context를 메시지 속성에 수동 전파해야 한다.

## Trace ID와 컨텍스트 전파 — 프로세스 경계를 넘는 끈

분산 추적의 마법은 전부 **context propagation**(컨텍스트 전파) 하나에 달려 있다. 서비스 A가 서비스 B를 HTTP로 호출할 때, "이 호출은 trace X의 일부이고, 너의 부모는 segment Y다"라는 정보를 어떻게든 B에게 전달해야 한다. 이게 안 되면 B가 만든 segment는 고아가 되어 trace에 붙지 못한다. X-Ray는 이 정보를 HTTP 헤더에 실어 나른다.

```
X-Amzn-Trace-Id: Root=1-65500000-1234abcd5678ef90; Parent=53995c3f42cd8ad8; Sampled=1
```

- `Root`: Trace ID. `1-` 버전, `65500000`은 요청 시각의 Unix epoch를 16진수로 인코딩한 것, 나머지는 96비트 랜덤이다. 즉 Trace ID 안에 **타임스탬프가 박혀 있다**.
- `Parent`: 호출자의 segment ID. 받는 쪽은 이걸 `parent_id`로 삼아 자기 segment를 매단다.
- `Sampled`: 이 trace를 수집할지(1) 버릴지(0)의 결정. **샘플링 결정은 trace의 입구에서 한 번 내려지고 전파**된다. 중간 서비스가 제멋대로 다시 정하지 않는다.

Trace ID에 타임스탬프를 박은 설계는 우연이 아니다. X-Ray는 trace를 시각 기반으로 파티셔닝·만료(30일 후 삭제)하는데, ID 자체에 시각이 있으면 별도 인덱스 조회 없이 ID만 보고 어느 시간 버킷에 속하는지 알 수 있다. 이는 KSUID나 ULID 같은 시간 정렬 가능 식별자가 UUIDv4를 대체하는 흐름과 같은 발상이다.

> 💡 **관련 이론**: HTTP 헤더로 trace context를 나르는 방식은 표준화 전쟁을 거쳤다. X-Ray는 `X-Amzn-Trace-Id`, Zipkin은 `X-B3-*`(B3 propagation), Jaeger는 `uber-trace-id`를 썼고, 서로 호환이 안 됐다. 이 혼란을 끝낸 것이 **W3C Trace Context** 표준(2020, `traceparent`/`tracestate` 헤더)이다. `traceparent: 00-{trace-id}-{parent-id}-{flags}` 형식으로 벤더 중립 전파를 정의했다. OpenTelemetry는 기본으로 W3C Trace Context를 쓰고, ADOT(Day 3)는 X-Ray 헤더와 W3C 헤더를 양방향 변환하는 propagator를 제공해 두 세계를 잇는다. "왜 X-Ray와 OTel이 섞이면 trace가 끊기나"의 답이 바로 이 propagation 포맷 불일치다.

> 📚 **사례**: 한 이커머스 회사가 주문 서비스(X-Ray SDK 사용)와 신규 결제 서비스(OpenTelemetry 사용)를 함께 운영했는데, 주문에서 결제로 넘어가는 순간 Service Map에서 trace가 두 동강 났다. 원인은 propagation 헤더 불일치였다 — 주문은 `X-Amzn-Trace-Id`를, 결제는 `traceparent`를 기대했다. ADOT Collector에 X-Ray propagator와 W3C propagator를 둘 다 설정해 헤더를 상호 변환하자 trace가 끝까지 이어졌다. 교훈: 멀티 SDK 환경에서 분산 추적의 첫 번째 실패 지점은 거의 항상 context propagation 포맷 불일치다.

## Active vs Passive Tracing — 누가 trace를 시작하는가

X-Ray에서 자주 혼동되는 개념이 Active와 Passive 추적이다. 차이는 "이 서비스가 trace를 **시작/생성**할 권한이 있는가"다.

- **Active Tracing**: 서비스가 들어온 요청에 trace가 없으면 **새로 생성**하고, 자신이 호출하는 다운스트림에 Trace ID를 전파한다. Lambda를 Active로 켜면 함수가 trace의 시작점이 될 수 있다.
- **Passive Tracing**: 외부에서 Trace ID가 들어오면 **따라가기만** 하고, 스스로 새 trace를 시작하지 않는다.

```yaml
# SAM — Lambda Active Tracing
Globals:
  Function:
    Tracing: Active
```

```bash
# API Gateway 스테이지에서 활성화
aws apigateway update-stage \
  --rest-api-id abc --stage-name prod \
  --patch-operations op=replace,path=/tracingEnabled,value=true
```

전형적 패턴은 **요청의 가장 앞단(API Gateway 또는 ALB)에서 trace를 시작**하고, 그 뒤의 모든 서비스가 전파된 ID를 따르는 것이다. 입구에서 한 번 샘플링을 결정하고 전체 체인이 그 결정을 공유하므로, 한 요청이 부분적으로만 추적되는 일이 없다.

> ⚠️ **함정**: Lambda의 Active Tracing은 **함수 코드의 실행 시간만이 아니라 Init(콜드 스타트) 구간도 segment로 잡는다**. 콜드 스타트가 잦은 함수의 trace를 보면 Init subsegment가 수백 ms로 찍혀 "왜 이렇게 느리지"라고 오해하기 쉽다. 이건 X-Ray가 거짓말하는 게 아니라 실제 콜드 스타트 비용을 정직하게 보여주는 것이다. 또 하나의 함정: Active Tracing만 켜고 SDK 계측(`patch_all`)을 안 하면, Lambda 호출 자체의 segment는 보이지만 함수 내부의 DynamoDB·HTTP 호출 subsegment가 비어 병목 구간을 못 본다. Active Tracing(누가 trace를 시작하나)과 SDK instrumentation(내부를 얼마나 쪼개 보나)은 별개의 스위치다.

## SDK와 Auto-Instrumentation — 계측의 투명성

Dapper의 세 목표 중 "application-level transparency"가 여기서 실현된다. 개발자가 모든 함수에 추적 코드를 넣는 건 불가능하므로, SDK가 라이브러리를 가로채(monkey-patch) 자동으로 subsegment를 만든다.

```python
from aws_xray_sdk.core import patch_all, xray_recorder
patch_all()   # boto3, requests, mysql, httplib 등을 런타임에 패치

@xray_recorder.capture('business_logic')
def process(order):
    table = boto3.resource('dynamodb').Table('orders')
    table.put_item(Item={'id': order['id']})  # 자동으로 subsegment 생성
```

`patch_all()`은 boto3·requests 같은 라이브러리의 메서드를 추적 래퍼로 교체한다. 이후 그 라이브러리로 외부를 호출할 때마다 SDK가 자동으로 subsegment를 열고(시작 시각 기록), 호출이 끝나면 닫는다(종료 시각·에러 기록). 코드 한 줄 안 바꿔도 DynamoDB·HTTP 호출이 trace에 나타나는 이유다.

실무에서는 raw SDK보다 **Lambda Powertools**의 Tracer를 권장한다. 어노테이션 헬퍼, 콜드 스타트 자동 표시, 응답 캡처 토글 등을 묶어 제공한다.

```python
from aws_lambda_powertools import Tracer
tracer = Tracer(service="checkout")

@tracer.capture_lambda_handler
def handler(event, context):
    tracer.put_annotation(key="OrderId", value=event['order_id'])  # 인덱싱됨
    tracer.put_metadata(key="rawEvent", value=event)               # 인덱싱 안 됨
    process(event['order_id'])

@tracer.capture_method
def process(order_id):
    ...
```

> 🔍 **더 깊이**: auto-instrumentation의 구현 메커니즘은 언어마다 다르다. Python/Ruby는 런타임에 메서드를 교체하는 **monkey-patching**, Java는 클래스 로딩 시점에 바이트코드를 변형하는 **bytecode instrumentation**(javaagent, ASM/ByteBuddy 기반), .NET은 **CLR Profiler API**를 쓴다. X-Ray SDK는 언어별 SDK 안에 이 패칭 로직을 내장하고, OpenTelemetry는 별도의 instrumentation 라이브러리로 분리했다. 이 차이가 중요한 이유: Java auto-instrumentation은 `-javaagent` 플래그만 추가하면 **소스 코드를 전혀 안 건드려도** 되지만, Python의 monkey-patching은 import 순서에 민감해 `patch_all()`을 다른 import보다 먼저 호출하지 않으면 일부 라이브러리가 패치되지 않는 미묘한 버그가 생긴다.

## Annotation vs Metadata — 역인덱스의 경제학

X-Ray에 추가 컨텍스트를 붙이는 두 가지 방법이 있고, 이 둘의 차이는 단순한 API 선택이 아니라 **검색 인덱스 비용**의 문제다.

- **Annotation**: 키-값 쌍으로, **인덱싱된다**. 즉 trace 검색에서 `annotation.OrderId = "abc"`처럼 필터·검색의 대상이 된다. 대신 trace당 최대 50개로 제한되고, 값은 문자열·숫자·불리언만 가능하다.
- **Metadata**: 인덱싱되지 않는다. 검색은 못 하지만, 임의의 JSON(큰 페이로드, 중첩 객체)을 담아 개별 trace를 열었을 때 디버그 정보로 볼 수 있다.

```python
tracer.put_annotation(key="UserId", value=user_id)        # 검색 가능, 저카디널리티 키 위주
tracer.put_metadata(key="RequestBody", value=event_body)  # 검색 불가, 상세 디버그용
```

이 설계는 검색 엔진의 근본 트레이드오프 그대로다. 인덱싱된 필드는 빠르게 검색되지만 **역인덱스(inverted index)를 만들고 유지하는 비용**이 든다. 그래서 X-Ray는 인덱싱되는 annotation에 개수 제한을 걸고, 검색이 필요 없는 상세 정보는 인덱싱하지 않는 metadata로 보내라고 강제한다.

> 💡 **관련 이론**: annotation/metadata의 분리는 Day 어제(Week 10) 본 CloudWatch의 메트릭(저카디널리티 집계)과 로그(고카디널리티 상세)의 분리와 정확히 같은 원리다. 일반화하면 옵저버빌리티 데이터는 항상 두 부류로 나뉜다 — **차원/태그/annotation처럼 인덱싱해 검색·집계하는 저카디널리티 키**와, **페이로드/metadata처럼 인덱싱 없이 보관만 하는 고카디널리티 상세**. 역인덱스 비용이 카디널리티에 비례하기 때문이다. `OrderId`(요청마다 고유, 고카디널리티)를 annotation으로 마구 넣으면 인덱스가 폭발하므로, 검색 키로 꼭 필요한 것만 annotation에 두고 나머지는 metadata로 내리는 것이 정석이다. 이는 Honeycomb·Elasticsearch의 "어떤 필드를 인덱싱할지"가 곧 비용 설계인 것과 같다.

## Service Map — 인과 그래프를 위상으로 집계하다

수천 개의 개별 trace는 사람이 다 볼 수 없다. X-Ray는 이들을 집계해 **Service Map**이라는 서비스 위상도(topology)를 자동 생성한다. 각 trace의 segment들을 서비스별로 묶어 노드로, 호출 관계를 엣지로 그린다.

- **노드**: 서비스(Lambda 함수, API Gateway, DynamoDB 테이블, ...). 노드 색이 빨강이면 에러율 높음.
- **엣지**: 호출 관계. 굵을수록 호출량 많고, 색·숫자로 평균 응답시간과 에러율(fault/error/throttle)을 표시.

문제 해석은 직관적이다 — **빨갛고 굵은 노드/엣지를 따라가면 병목과 장애 지점이 나온다**. 노드를 클릭하면 그 서비스를 거친 trace 목록으로, 다시 개별 trace로 드릴다운해 어느 subsegment가 시간을 잡아먹었는지 본다.

```
  User → API Gateway → Lambda A → Lambda B → DynamoDB
   Service Map (자동 집계):
     APIGW ──→ LambdaA ──→ LambdaB ──→ DynamoDB
              (p50/p99 latency, error% 가 각 엣지에)
```

> 🔍 **더 깊이**: Service Map은 개별 trace의 인과 그래프들을 **위상적으로 합집합(union)**한 것이다. trace 하나는 "이 요청이 거친 경로"지만, Service Map은 "모든 요청이 거친 경로의 합"이라 시스템 전체 구조를 드러낸다. 여기서 핵심은 **에러의 세 분류**다 — `fault`(5xx, 서버 잘못), `error`(4xx, 클라이언트 잘못), `throttle`(429, 속도 제한). Service Map이 빨갛다고 다 같은 빨강이 아니다. throttle이 많으면 용량/스로틀링 문제, fault가 많으면 코드/의존성 장애, error가 많으면 잘못된 요청이 들어오는 것이다. 이 분류를 구분하지 못하면 "빨간 노드"를 보고 엉뚱한 곳을 고치게 된다.

## X-Ray Daemon — 왜 직접 안 보내고 Daemon을 거치나

Lambda는 X-Ray와 자동 통합되어 별도 설정이 없지만, EC2·ECS·EKS에서는 **X-Ray Daemon**을 거쳐야 한다. 애플리케이션은 segment를 X-Ray API로 직접 보내지 않고, 로컬에서 도는 Daemon에게 **UDP**로 던진다. Daemon이 이를 모아 배치로 X-Ray 서비스에 전송한다.

- ECS: **사이드카 컨테이너**로 Daemon 실행
- EC2: systemd 서비스
- EKS: **DaemonSet**(노드마다 하나)

왜 이 간접층을 두는가? Dapper의 "low overhead" 목표 때문이다. 애플리케이션이 매 호출마다 X-Ray API를 동기로 부르면 네트워크 왕복이 본 요청에 더해진다. UDP로 던지면 fire-and-forget이라 애플리케이션은 응답을 기다리지 않고, Daemon이 비동기로 배치 전송·재시도·버퍼링을 떠맡는다. 이는 로깅에서 애플리케이션이 직접 원격 전송하지 않고 로컬 에이전트(Fluent Bit)에 던지는 패턴과 똑같다.

> 💡 **관련 이론**: 애플리케이션과 텔레메트리 백엔드 사이에 로컬 에이전트를 두는 이 패턴은 **사이드카 패턴**(sidecar pattern)의 전형이다. 관심사 분리 — 애플리케이션은 "텔레메트리를 던지는" 책임만 지고, "배치·재시도·압축·인증·라우팅"은 사이드카가 진다. UDP를 쓰는 이유는 **추적 데이터의 손실 허용성**이다. trace는 통계적 표본이라 일부를 잃어도 전체 그림이 크게 흔들리지 않으므로, 신뢰성(TCP)보다 낮은 오버헤드(UDP)를 택한다. 반대로 결제 트랜잭션이라면 절대 UDP를 쓰지 않는다. "데이터의 가치 대비 손실 허용도가 전송 프로토콜을 결정한다"는 일반 원리의 사례다.

## X-Ray Insights — 자동 이상 탐지

trace를 사람이 계속 들여다볼 수는 없다. **X-Ray Insights**는 Service Map의 정상 baseline을 학습해, latency·error rate가 비정상으로 튀면 자동으로 Insight를 생성하고 EventBridge 이벤트를 발행한다. 이를 Lambda/SNS로 연결해 자동 알림·자동 대응을 건다.

```json
{ "source": ["aws.xray"], "detail-type": ["AWS X-Ray Insight Update"] }
```

이는 Week 10에서 본 CloudWatch Anomaly Detection과 같은 계열 — 정적 임계값 대신 학습된 정상 패턴에서의 이탈을 탐지한다. 차이는 대상이 메트릭이 아니라 trace 기반 서비스 위상의 건강도라는 점이다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **분산 추적은 Dapper(2010)에서 태어난 trace-span-context propagation 모델**이고, X-Ray의 Trace/Segment/Subsegment는 그 AWS판이다. 둘째, **모든 마법은 context propagation 하나에 달려 있다** — Trace ID를 헤더로 전파하며, X-Ray 헤더와 W3C `traceparent`의 불일치가 멀티 SDK 환경에서 trace가 끊기는 첫 번째 원인이다. 셋째, **Active vs Passive는 trace를 시작할 권한**의 차이이고, Active Tracing과 SDK instrumentation은 별개 스위치다. 넷째, **Annotation은 인덱싱(검색 가능, 저카디널리티), Metadata는 비인덱싱(상세)**이며 이는 역인덱스의 경제학이다. 다섯째, **Service Map은 개별 인과 그래프의 위상적 합집합**이고, fault/error/throttle 세 분류를 구분해야 올바른 곳을 고친다.

다음 글에서는 X-Ray의 **샘플링과 운영 규모에서의 비용 튜닝**을 깊이 본다. Reservoir 샘플링이 왜 이런 구조인지, 샘플링 결정이 어떻게 분산 환경에서 일관되게 전파되는지, Group과 검색 표현식으로 어떻게 거대한 Service Map을 다루는지를 판다.

---

## 📝 연습 문제

**문제 1.** 주문 서비스(X-Ray SDK)와 결제 서비스(OpenTelemetry)를 함께 운영하는데, 주문→결제 구간에서 Service Map의 trace가 두 동강 난다. 가장 가능성 높은 원인과 해결은?

A) X-Ray retention이 만료됐다 — 보존 기간을 늘린다

B) context propagation 헤더 불일치(`X-Amzn-Trace-Id` vs W3C `traceparent`) — ADOT에 양쪽 propagator를 설정해 헤더를 상호 변환한다

C) 샘플링 비율이 낮다 — FixedRate를 100%로 올린다

D) IAM 권한 부족 — X-Ray 쓰기 정책을 추가한다

**정답: B**

해설: 멀티 SDK 환경에서 trace가 끊기는 첫 번째 실패 지점은 거의 항상 context propagation 포맷 불일치다. X-Ray SDK는 `X-Amzn-Trace-Id` 헤더를, OpenTelemetry는 W3C Trace Context의 `traceparent` 헤더를 기대한다. 받는 쪽이 보낸 쪽의 헤더 포맷을 이해하지 못하면 부모 컨텍스트를 복원하지 못해 새 trace로 시작하고, Service Map에서 두 동강 난다. ADOT Collector에 X-Ray propagator와 W3C propagator를 모두 설정해 헤더를 양방향 변환하면 trace가 끝까지 이어진다. retention(A)·샘플링(C)·IAM(D)은 trace 단절이 아니라 각각 보존·수집량·전송 실패와 관련된 별개 문제다.

---

**문제 2.** Lambda에 Active Tracing을 켰는데 Service Map에 함수 호출 segment는 보이지만, 함수 내부의 DynamoDB·HTTP 호출 subsegment가 전혀 안 보인다. 원인은?

A) Active Tracing은 켰지만 SDK instrumentation(`patch_all`/Powertools `capture`)을 안 해서 내부 호출이 계측되지 않았다

B) Lambda는 subsegment를 지원하지 않는다

C) DynamoDB는 X-Ray와 통합되지 않는다

D) Daemon이 없어서다

**정답: A**

해설: Active Tracing(누가 trace를 시작하고 다운스트림에 ID를 전파하나)과 SDK instrumentation(함수 내부를 얼마나 쪼개 보나)은 별개의 스위치다. Active Tracing만 켜면 Lambda 호출 자체의 segment는 생기지만, 함수 안의 boto3·HTTP 호출을 subsegment로 잡으려면 `patch_all()`이나 Powertools Tracer로 라이브러리를 계측해야 한다. 계측이 없으면 내부가 빈 채로 segment 하나만 보여 병목 구간을 못 본다. Lambda는 subsegment를 지원하고(B 틀림), DynamoDB도 X-Ray와 통합되며(C 틀림), Lambda는 Daemon이 불필요하다(D 틀림).

---

**문제 3.** Trace당 50개 제한이 있고 인덱싱되어 `annotation.OrderId = "..."`로 검색 가능한 X-Ray 추가 데이터는?

A) Metadata

B) Annotation

C) Subsegment

D) Segment Document 전체

**정답: B**

해설: Annotation은 키-값 쌍으로 인덱싱되어 trace 검색·필터의 대상이 되며, 인덱싱 비용 때문에 trace당 최대 50개, 값은 문자열·숫자·불리언으로 제한된다. Metadata(A)는 인덱싱되지 않아 검색은 불가하지만 임의의 큰 JSON을 디버그용으로 담을 수 있다. 역인덱스 유지 비용이 카디널리티에 비례하므로, 검색 키로 꼭 필요한 저카디널리티 값만 annotation에 두고 상세 페이로드는 metadata로 내리는 것이 정석이다.

---

**문제 4.** EC2에서 실행되는 애플리케이션이 X-Ray에 trace를 보내는 표준 경로는?

A) 애플리케이션이 X-Ray API를 매 호출마다 동기로 직접 호출

B) X-Ray Daemon에 UDP로 던지고, Daemon이 배치로 X-Ray에 전송

C) S3에 segment를 저장하면 X-Ray가 폴링

D) CloudTrail을 통해 전달

**정답: B**

해설: EC2·ECS·EKS에서는 애플리케이션이 로컬 X-Ray Daemon에 UDP(fire-and-forget)로 segment를 던지고, Daemon이 버퍼링·배치·재시도를 맡아 X-Ray 서비스에 전송한다. 이는 Dapper의 "low overhead" 목표를 구현하는 사이드카 패턴이다 — 애플리케이션은 응답을 기다리지 않고, 추적 데이터의 손실 허용성 덕에 신뢰성(TCP)보다 낮은 오버헤드(UDP)를 택한다. 직접 동기 호출(A)은 본 요청에 네트워크 왕복을 더해 느려진다. Lambda만 Daemon 없이 자동 통합된다.

---

**문제 5.** Service Map에서 한 노드가 빨갛게 표시된다. throttle, fault(5xx), error(4xx)를 구분하는 것이 왜 중요한가?

A) 색만 다를 뿐 대응은 동일하다

B) throttle은 용량/스로틀링, fault는 코드/의존성 장애, error는 잘못된 요청 유입을 뜻해 근본 대응이 완전히 다르다

C) error가 가장 심각하므로 항상 먼저 본다

D) 세 분류는 비용 청구에만 쓰인다

**정답: B**

해설: X-Ray는 에러를 세 분류로 나눈다 — `throttle`(429, 속도 제한 → 용량 증설/스로틀 완화), `fault`(5xx, 서버 잘못 → 코드 버그/다운스트림 의존성 장애), `error`(4xx, 클라이언트 잘못 → 잘못된 요청이 들어옴). "빨간 노드"라는 사실만으로는 무엇을 고칠지 알 수 없고, 분류를 봐야 올바른 곳을 고친다. 예컨대 throttle이 원인인데 코드를 디버깅하면 시간을 낭비한다. 대응이 동일하다(A)거나 단순 청구용(D)이라는 설명은 틀리며, 심각도 순위(C)는 상황에 따라 다르다.

---

**문제 6.** X-Ray Trace ID `1-65500000-1234abcd...`의 `65500000` 부분이 의미하는 것과 그 설계 이점은?

A) 랜덤 시드일 뿐 의미 없음

B) 요청 시각의 Unix epoch(16진수) — ID만 보고 시간 버킷을 알 수 있어 시각 기반 파티셔닝·만료가 인덱스 조회 없이 가능

C) 리전 코드

D) 샘플링 비율

**정답: B**

해설: X-Ray Trace ID는 `버전-타임스탬프-랜덤` 구조로, 가운데가 요청 시각의 Unix epoch를 16진수로 인코딩한 것이다. ID 안에 시각이 박혀 있어 별도 인덱스 조회 없이 ID만 보고 어느 시간 버킷에 속하는지 알 수 있고, 이는 30일 만료·시각 기반 파티셔닝을 효율화한다. KSUID·ULID가 UUIDv4를 대체하며 시간 정렬 가능성을 제공하는 것과 같은 발상이다. 리전(C)·샘플링(D)·무의미(A)는 모두 틀리다.

---

**문제 7.** 분산 추적(Dapper)이 정의한 세 가지 설계 목표가 아닌 것은?

A) low overhead (본 서비스를 느리게 하지 않음)

B) application-level transparency (auto-instrumentation으로 일일이 계측 안 해도 됨)

C) scalability (대규모에서 동작)

D) exactly-once delivery (모든 trace를 정확히 한 번 전송 보장)

**정답: D**

해설: Dapper 논문이 정의한 세 목표는 low overhead, application-level transparency, scalability다. trace는 통계적 표본이라 일부 손실을 허용하며(그래서 Daemon이 UDP를 쓴다), exactly-once delivery는 추적 시스템의 목표가 아니다. 오히려 샘플링으로 의도적으로 일부만 수집해 overhead를 제어한다. A·B·C는 모두 Dapper의 핵심 목표이며 X-Ray의 SDK auto-patching, 샘플링, Daemon 배치 전송으로 각각 구현된다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 분산 추적은 Google Dapper(2010)의 trace-span-context propagation 모델에서 태어났고, X-Ray의 Trace/Segment/Subsegment는 그 AWS판이며 trace는 트리가 아니라 DAG에 가깝다. 둘째, 모든 것이 context propagation에 달려 있다 — Trace ID를 헤더로 전파하며, X-Ray의 `X-Amzn-Trace-Id`와 W3C `traceparent` 불일치가 멀티 SDK 환경에서 trace 단절의 첫 원인이고 ADOT propagator로 잇는다. 셋째, Active vs Passive는 trace 시작 권한의 차이이고 SDK instrumentation과는 별개 스위치이며, Active Tracing만으로는 내부 subsegment가 안 보인다. 넷째, Annotation은 인덱싱(검색·저카디널리티 50개 제한), Metadata는 비인덱싱(상세 JSON)으로 역인덱스 경제학을 따른다. 다섯째, Service Map은 개별 인과 그래프의 위상적 합집합이고 fault/error/throttle 세 분류를 구분해야 하며, Daemon은 UDP 사이드카로 low overhead를 구현한다.
