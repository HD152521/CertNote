# Day 2 - X-Ray 샘플링: Reservoir 알고리즘과 운영 규모의 추적 경제학

추적의 이상(理想)은 "모든 요청을 다 보는 것"이다. 그런데 초당 만 건이 들어오는 서비스에서 모든 요청을 추적하면, 추적 데이터가 본 서비스 트래픽만큼 쏟아진다. 저장 비용, 전송 대역폭, 인덱싱 부하가 본 워크로드와 맞먹는 규모로 불어난다. 그래서 분산 추적의 첫날부터 — Dapper 논문이 이미 — 샘플링은 선택이 아니라 필수였다. 문제는 "어떻게 샘플링하는가"다. 무작정 1%만 뽑으면 트래픽이 적은 중요한 엔드포인트(예: 결제)는 한 시간에 한 건도 안 잡힐 수 있고, 100%로 뽑으면 헬스체크 같은 노이즈가 추적 비용을 잡아먹는다. X-Ray의 샘플링 규칙은 이 긴장을 **Reservoir + FixedRate**라는 두 손잡이로 정교하게 다룬다.

오늘은 샘플링을 단순히 "비율 설정"으로 보지 않고, 그 밑의 알고리즘과 분산 일관성 문제를 판다. Reservoir 샘플링이 통계학에서 어떤 문제를 푸는 알고리즘인지, X-Ray가 왜 "초당 보장 + 초과분 비율"이라는 두 단계 구조를 쓰는지, 샘플링 결정이 어떻게 분산된 여러 노드에서 일관되게 내려지는지(head-based vs tail-based), 그리고 거대한 Service Map을 Group과 검색 표현식으로 어떻게 쪼개 다루는지를 본다. DOP 시험에서 "결제는 100% 추적하되 헬스체크는 제외하고 비용을 최소화하라" 같은 시나리오는 정확히 이 샘플링 규칙 설계 문제다.

## Reservoir 샘플링 — 흐르는 강물에서 N개를 공정하게 뽑기

X-Ray 샘플링 규칙의 `ReservoirSize`라는 이름은 통계학의 **Reservoir Sampling**(저수지 샘플링) 알고리즘에서 왔다. 이 알고리즘이 푸는 문제는 이렇다: "전체 개수를 미리 모르는, 끝없이 흐르는 스트림에서, 모든 원소가 동일한 확률로 뽑히도록 정확히 k개의 표본을 유지하라. 단, 메모리는 k개만 쓸 수 있다." 스트림 처리의 고전 문제다.

X-Ray의 맥락에서 reservoir는 변형되어 쓰인다 — "**매 초마다 최소 N개의 trace는 무조건 수집하도록 보장**"하는 장치다. 이게 왜 필요한가? 순수 비율 샘플링(FixedRate)만 쓰면, 트래픽이 낮은 엔드포인트는 표본이 거의 안 잡힌다. 초당 2건 들어오는 결제 API에 5% 비율을 걸면 한 시간에 360건 중 18건만 잡히고, 운 나쁘면 장애 순간의 trace가 통째로 빠진다. Reservoir는 "비율과 무관하게 초당 최소 N건은 확보"해 저트래픽 엔드포인트의 가시성을 보장한다.

```json
{
  "RuleName": "checkout-full",
  "Priority": 100,
  "ReservoirSize": 100,
  "FixedRate": 1.0,
  "URLPath": "/checkout/*",
  "ServiceName": "checkout-api",
  "ServiceType": "*", "Host": "*", "HTTPMethod": "*",
  "ResourceARN": "*", "Version": 1
}
```

샘플링 결정 순서는 두 단계다. ① 이번 초의 reservoir 할당량(`ReservoirSize`)이 아직 안 찼으면 무조건 수집한다. ② reservoir를 다 채운 뒤 추가로 들어오는 요청은 `FixedRate` 비율로 수집한다. 즉 "**기본 보장량(reservoir) + 초과분 비율(rate)**"의 합이 최종 수집량이다.

> 💡 **관련 이론**: 고전 Reservoir Sampling(Algorithm R, Vitter 1985)은 i번째 원소를 k/i 확률로 받아들여 기존 표본 하나와 교체함으로써, 스트림 길이를 모르고도 모든 원소가 균등 확률 k/n으로 선택됨을 보장한다. 핵심 통찰은 "한 번 지나간 데이터를 다시 못 보는 단일 패스 스트림에서 균등 표본을 유지"하는 것이다. X-Ray는 이 알고리즘 자체를 그대로 쓰진 않지만, "스트림에서 고정 예산(reservoir)만큼 보장 수집"이라는 발상을 차용했다. 같은 계열의 스트림 샘플링이 데이터 엔지니어링 전반에 깔려 있다 — Kafka 컨슈머의 샘플 로깅, 로드 테스트 도구의 요청 샘플링, 데이터베이스의 `TABLESAMPLE`이 모두 "전수 처리 없이 대표 표본"이라는 같은 문제를 푼다.

> 🔍 **더 깊이**: X-Ray 샘플링은 **head-based sampling**(요청 입구에서 결정)이다. 요청이 들어오는 순간 "이 trace를 수집할지"를 정하고 `Sampled=1/0`을 전체 체인에 전파한다(Day 1의 propagation). 장점은 단순하고 오버헤드가 낮다는 것 — 버릴 trace는 처음부터 데이터를 안 만든다. 단점은 **"결과를 보고 흥미로운 것만 고를 수 없다"**는 점이다. 입구에서 결정하므로, 이 요청이 나중에 에러를 낼지 느릴지 모른 채 동전을 던진다. 이를 보완하는 것이 **tail-based sampling**(전부 일단 수집 후 trace 완성 시점에 선택) — "에러 난 trace와 p99 느린 trace는 100% 유지, 정상 trace는 1%만"처럼 결과 기반 선택이 가능하다. 단점은 모든 trace를 일단 버퍼링해야 해 오버헤드가 크다. X-Ray 네이티브는 head-based지만, ADOT Collector(Day 3)에 tail-sampling processor를 두면 결과 기반 샘플링을 얹을 수 있다. "에러 trace를 절대 놓치면 안 된다"는 요구는 tail-based로만 완전히 푼다.

## 샘플링 규칙의 우선순위 — 정책의 평가 순서

여러 샘플링 규칙이 있을 때, 어느 규칙을 적용할지는 **Priority**(우선순위)로 결정된다. 숫자가 **낮을수록 먼저** 평가되고, 매칭되는 첫 규칙이 적용된다. AWS 기본 규칙(`Default`)은 Priority 9000으로 가장 마지막에 평가되는 fallback이다.

```
요청 → 규칙들을 Priority 오름차순으로 평가
  Priority 100: /checkout/* 매칭? → yes → Reservoir 100, Rate 100% 적용 (끝)
  Priority 200: /health 매칭?    → (체크 안 됨, 위에서 끝남)
  Priority 9000: Default *       → (도달 안 함)
```

전형적 규칙 세트:

| 규칙 | Priority | Reservoir | FixedRate | 매칭 | 의도 |
|------|----------|-----------|-----------|------|------|
| checkout | 100 | 100 | 1.0 (100%) | `/checkout/*` | 결제는 전수 추적 |
| health | 200 | 0 | 0.0 (0%) | `/health` | 헬스체크 완전 제외 |
| Default | 9000 | 1 | 0.05 (5%) | `*` | 나머지 5% |

이 설계의 핵심은 "**비싸고 중요한 경로는 낮은 Priority로 먼저 잡아 전수 추적, 노이즈는 0%로 제외, 나머지는 기본 비율**"이다. Priority가 평가 순서를 정하므로, 구체적 규칙(특정 경로)을 낮은 숫자로, 포괄 규칙(`*`)을 높은 숫자로 두는 것이 정석이다 — 방화벽 ACL이나 라우팅 테이블의 "구체적 규칙 먼저, 포괄 규칙 나중" 원리와 같다.

> ⚠️ **함정**: 샘플링 규칙은 **X-Ray 서비스가 중앙에서 관리하고 SDK가 폴링으로 가져온다**. SDK는 약 10초마다 X-Ray에 규칙을 받아오고(`GetSamplingRules`), reservoir 할당량을 보고·요청한다(`GetSamplingTargets`). 즉 규칙을 바꿔도 모든 인스턴스에 반영되기까지 수 초의 지연이 있다. 또한 reservoir는 **계정·리전 전체에 걸쳐 분산 조율**된다 — 각 SDK 인스턴스가 자기 몫의 reservoir 할당량을 X-Ray로부터 받아오므로, 인스턴스가 100대여도 reservoir 100이 100×100이 되지 않고 전체 합이 100으로 유지된다. 이 분산 조율을 모르면 "Reservoir를 10으로 했는데 왜 초당 수백 건이 잡히나"(여러 인스턴스 합산 오해)나 "규칙을 바꿨는데 즉시 안 변한다"(폴링 지연) 같은 혼란이 생긴다.

## Group — 거대한 Service Map을 슬라이스하다

수백 개 서비스가 도는 조직에서 Service Map은 한 화면에 다 안 들어오는 거미줄이 된다. **X-Ray Group**은 필터 표현식으로 전체 Service Map의 부분집합을 잘라낸 뷰다.

```bash
aws xray create-group \
  --group-name PaymentService \
  --filter-expression 'service("payment-api") OR service("billing")'
```

콘솔에서 이 Group을 선택하면 결제 관련 서비스만 보인다. 큰 조직에서 팀별·도메인별로 Service Map을 분할해, 각 팀이 자기 책임 영역만 집중해서 보게 한다. Group은 또한 **CloudWatch 메트릭의 차원**이 되어, "이 Group의 평균 응답시간/에러율" 같은 메트릭에 알람을 걸 수 있다.

## 검색 표현식 — trace를 질의하는 DSL

X-Ray는 trace를 검색하는 자체 표현식 언어를 제공한다. 인덱싱된 필드(http 상태, 응답시간, annotation 등)를 대상으로 한다.

```
service("checkout-api") AND http.status = 500
annotation.OrderId = "abc123"
duration > 1
responsetime > 0.5 AND http.url CONTAINS "/api/v2/"
fault = true
```

연산자: `AND/OR/NOT`, `=`, `!=`, `CONTAINS`, `>`, `<`. 운영에서 자주 쓰는 패턴:

| 질문 | Expression |
|------|-----------|
| 결제 API의 500 에러 trace | `service("checkout") AND http.status = 500` |
| p99 느린 요청 (>2초) | `duration > 2` |
| 특정 사용자 추적 | `annotation.UserId = "u-123"` |
| DynamoDB throttle | `service("dynamodb") AND error.cause CONTAINS "ProvisionedThroughputExceeded"` |

여기서 **annotation으로 추가한 필드만 검색 가능**하다는 Day 1의 원리가 다시 등장한다. `OrderId`를 annotation으로 넣었기에 `annotation.OrderId = ...`로 찾을 수 있다. metadata로 넣었다면 이 검색은 불가능하다 — 인덱싱되지 않았기 때문이다.

> 💡 **관련 이론**: `duration > 2`로 느린 trace를 찾는 것은 옵저버빌리티에서 **outlier 분석**의 출발점이다. 평균 응답시간은 거짓말을 한다 — p50이 100ms여도 p99가 5초면 1%의 사용자는 끔찍한 경험을 한다. 분산 시스템의 **tail latency**(꼬리 지연)는 단순 평균으로는 절대 안 보인다. Jeff Dean의 "The Tail at Scale"(2013)이 정리한 핵심: 서비스가 100개 컴포넌트를 병렬 호출하면, 각 컴포넌트의 p99가 좋아도 전체 요청은 거의 항상 누군가의 p99를 만나 느려진다(99%^100 ≈ 37%만 빠름). 그래서 trace 검색의 본질은 "느린 개별 trace를 잡아 어느 subsegment가 꼬리를 만들었는지"를 보는 것이다. 메트릭(집계)은 "느리다"를 알려주고, trace(개별)는 "왜 느린지"를 알려준다.

## X-Ray Insights — 학습된 baseline에서의 이탈 탐지

운영자가 trace와 Service Map을 24시간 감시할 수는 없다. **X-Ray Insights**(2020+)는 Service Map의 정상 패턴(fault rate baseline)을 학습해, 이상 패턴을 자동 탐지하고 Insight를 생성한다. Insight는 영향받은 root cause 서비스, 영향 범위, 시간 경과를 묶어 보여주고, EventBridge로 이벤트를 발행해 자동 대응을 연결한다.

```json
{ "source": ["aws.xray"], "detail-type": ["AWS X-Ray Insight Update"] }
```

이 이벤트를 EventBridge 규칙으로 받아 Lambda·SNS·SSM Automation으로 연결하면 "이상 탐지 → 자동 알림/자동 진단"의 파이프라인이 된다. CloudWatch Anomaly Detection이 메트릭의 이탈을 보는 것과 짝을 이뤄, X-Ray Insights는 서비스 위상의 건강도 이탈을 본다.

> 📚 **사례**: 한 SaaS 기업이 야간 배포 후 특정 다운스트림 의존성의 fault rate가 서서히 올랐는데, 절대값이 알람 임계값(고정 5%) 아래라 CloudWatch 알람은 안 울렸다. 그러나 그 서비스의 평소 fault rate가 0.1%였기에 X-Ray Insights는 "baseline 대비 비정상 상승"으로 즉시 Insight를 생성했다. EventBridge로 Slack에 알림이 가 30분 만에 롤백했다. 교훈: 고정 임계값은 "절대값은 낮지만 평소 대비 비정상"인 초기 열화를 놓친다. baseline 학습 기반 탐지(Insights)가 이 사각지대를 메운다. 둘은 경쟁이 아니라 보완 관계다.

## 비용 최적화의 실제 — Reservoir와 Rate의 경제학

샘플링 설계는 곧 비용 설계다. X-Ray는 기록된 trace 수와 검색된 trace 수로 과금하므로, "얼마나 수집하느냐"가 직접 청구서가 된다.

- **1000 req/s × 100%** = 1000 trace/s → 풀 비용. 대부분의 워크로드에 과하다.
- **Reservoir 1 + FixedRate 1%** → 초당 약 1(보장) + 10(초과분의 1%) ≈ 11 trace/s. 비용이 두 자릿수 분의 일로 줄면서도 저트래픽 구간 가시성(reservoir 1)은 유지.
- **비즈니스 critical path만 100%, 나머지는 낮은 비율** → 중요한 곳은 다 보고, 노이즈는 표본만.

추가로 Powertools Tracer는 `POWERTOOLS_TRACER_CAPTURE_RESPONSE=false`로 응답 페이로드를 metadata에 안 담게 해, 큰 응답이 trace 크기를 부풀리는 비용을 줄인다. 이는 "검색 안 할 큰 데이터는 굳이 trace에 싣지 마라"는 Day 1 원리의 비용 측면이다.

> 🎯 **시나리오**: "결제 API는 장애 시 단 한 건의 trace도 놓치면 안 되고, 헬스체크(`/health`)는 추적에서 완전히 빼고, 그 외 일반 트래픽은 비용을 위해 5%만 추적하고 싶다. 어떻게 구성하나?" — 답은 Priority로 분리한 세 규칙이다. ① `/checkout/*` 규칙을 Priority 100(낮음=먼저 평가), Reservoir 크게(예: 100) + FixedRate 1.0으로 두어 결제는 사실상 전수 추적. ② `/health` 규칙을 Priority 200, Reservoir 0 + FixedRate 0.0으로 두어 헬스체크 완전 제외. ③ Default 규칙(Priority 9000)을 FixedRate 0.05로 두어 나머지 5%. 핵심은 **구체적 규칙을 낮은 Priority로 먼저 매칭시키고, 포괄 규칙을 마지막에 두는 평가 순서**다. "장애 trace를 절대 놓치면 안 된다"가 더 엄격한 요구라면, ADOT의 tail-based 샘플링으로 "에러·고지연 trace 100% 유지"를 추가로 얹는다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **샘플링은 추적의 필수 전제**이고, X-Ray는 Reservoir(초당 최소 보장) + FixedRate(초과분 비율)의 두 단계로 저트래픽 가시성과 비용을 동시에 잡는다. 둘째, **X-Ray는 head-based 샘플링**(입구에서 결정·전파)이라 단순·저오버헤드지만 결과 기반 선택이 안 되고, 그건 ADOT의 tail-based로 보완한다. 셋째, **Priority는 평가 순서**로, 구체적 규칙을 먼저·포괄 규칙을 나중에 두며, reservoir는 계정·리전 전체에서 분산 조율된다. 넷째, **Group으로 거대한 Service Map을 슬라이스**하고, **검색 표현식으로 outlier(느린·에러 trace)를 질의**하되 annotation으로 넣은 필드만 검색된다. 다섯째, **X-Ray Insights는 baseline 학습으로 "절대값은 낮지만 비정상" 열화를 잡아** 고정 임계값의 사각지대를 메운다.

다음 글에서는 X-Ray와 CloudWatch에 묶인 추적을 표준화·벤더 중립화하는 **ADOT(AWS Distro for OpenTelemetry)**를 깊이 본다. OpenTelemetry가 왜 추적 도구 전쟁을 끝냈는지, Collector의 receiver-processor-exporter 파이프라인이 무엇인지를 판다.

---

## 📝 연습 문제

**문제 1.** 초당 2건만 들어오는 결제 API에 FixedRate 5%만 걸었더니, 장애가 난 시점의 trace가 통째로 안 잡혔다. 저트래픽 엔드포인트의 추적 가시성을 보장하는 메커니즘은?

A) FixedRate를 100%로 올린다

B) ReservoirSize를 설정해 비율과 무관하게 초당 최소 N건을 무조건 수집하도록 보장한다

C) X-Ray Group을 만든다

D) Priority를 9000으로 올린다

**정답: B**

해설: 순수 비율 샘플링(FixedRate)만 쓰면 트래픽이 적은 엔드포인트는 표본이 거의 안 잡혀 장애 순간을 놓칠 수 있다. ReservoirSize는 "매 초 최소 N건은 비율과 무관하게 무조건 수집"을 보장해 저트래픽 구간의 가시성을 확보한다. FixedRate 100%(A)는 가능하지만 트래픽이 높아지면 비용이 폭증하므로 reservoir로 보장량만 확보하는 것이 경제적이다. Group(C)은 Service Map 슬라이싱, Priority(D)는 규칙 평가 순서로 무관하다.

---

**문제 2.** "정상 trace는 1%만, 그러나 에러가 난 trace와 p99로 느린 trace는 100% 유지"하고 싶다. X-Ray 네이티브 head-based 샘플링만으로 이게 어려운 이유와 해결은?

A) 가능하다 — FixedRate를 1%로 하면 된다

B) head-based는 요청 입구에서 결과를 모른 채 결정하므로 "에러/느린 것만 골라 유지"가 불가능하다 — ADOT Collector의 tail-based 샘플링으로 trace 완성 후 결과 기반 선택을 얹는다

C) Reservoir를 0으로 한다

D) Priority를 조정하면 된다

**정답: B**

해설: X-Ray 네이티브 샘플링은 head-based로, 요청이 들어오는 순간 수집 여부를 정하고 전파한다. 이 시점엔 그 요청이 에러를 낼지 느릴지 모르므로 "결과가 흥미로운 trace만 유지"가 구조적으로 불가능하다. tail-based 샘플링은 모든 trace를 일단 수집한 뒤 trace가 완성되는 시점에 선택하므로 "에러·고지연 100% 유지, 정상 1%"가 가능하다. ADOT Collector의 tail_sampling processor가 이를 제공한다. FixedRate 1%(A)는 에러 trace의 99%를 무작위로 버린다.

---

**문제 3.** 다음 샘플링 규칙들이 있다. `/checkout/payment` 요청에 적용되는 규칙은?

```
Priority 100: URLPath=/checkout/*  (Reservoir 100, Rate 1.0)
Priority 200: URLPath=/health      (Reservoir 0,   Rate 0.0)
Priority 9000: URLPath=*           (Reservoir 1,   Rate 0.05)
```

A) Priority 9000 (Default) — 가장 포괄적이므로

B) Priority 100 — 가장 낮은 숫자가 먼저 평가되고 `/checkout/*`에 매칭되어 적용 후 종료

C) 세 규칙이 모두 합산 적용

D) Priority 200

**정답: B**

해설: 샘플링 규칙은 Priority 오름차순(낮은 숫자 먼저)으로 평가되고, 매칭되는 첫 규칙이 적용된 뒤 종료된다. `/checkout/payment`는 Priority 100의 `/checkout/*`에 매칭되므로 Reservoir 100 + Rate 1.0(전수 추적)이 적용되고, 그 아래 규칙들은 평가되지 않는다. 구체적 규칙을 낮은 Priority로, 포괄 규칙(`*`)을 높은 Priority로 두는 것이 정석이다(ACL·라우팅의 구체적 우선 원리와 동일). 규칙은 합산(C)이 아니라 첫 매칭만 적용된다.

---

**문제 4.** ReservoirSize를 10으로 설정했는데, 같은 서비스가 100개 인스턴스에서 돈다. 실제 수집되는 reservoir trace는 초당 몇 건에 가까운가?

A) 약 1000건 (10 × 100 인스턴스)

B) 약 10건 — reservoir는 계정·리전 전체에서 분산 조율되어 인스턴스 수와 무관하게 전체 합이 reservoir 크기로 유지된다

C) 0건

D) 인스턴스당 10건씩 독립

**정답: B**

해설: X-Ray의 reservoir는 인스턴스마다 독립적이지 않다. 각 SDK 인스턴스가 `GetSamplingTargets`로 X-Ray에 자기 몫의 reservoir 할당량을 요청하고, X-Ray가 전체 reservoir(10)를 인스턴스들에 분배한다. 따라서 100대가 돌아도 전체 reservoir 수집은 약 10건/초로 유지되지 10×100=1000이 되지 않는다. 이 분산 조율을 모르면 "왜 예상보다 적게/많이 잡히나"를 오해하게 된다.

---

**문제 5.** 평균 응답시간(p50)은 100ms로 정상인데 일부 사용자가 "느리다"고 호소한다. 어느 subsegment가 꼬리 지연을 만드는지 찾으려면?

A) 평균 메트릭에 알람을 더 건다

B) 검색 표현식 `duration > 2`로 느린 trace를 골라 개별 trace의 subsegment 타임라인을 분석한다

C) Reservoir를 늘린다

D) Group을 만든다

**정답: B**

해설: 평균은 tail latency를 숨긴다 — p50이 좋아도 p99가 나쁘면 일부 사용자는 끔찍한 경험을 한다("The Tail at Scale", Jeff Dean 2013). 메트릭(집계)은 "느리다"를 알려주지만 "왜 느린지"는 개별 trace를 봐야 안다. `duration > 2` 같은 검색으로 느린 trace를 골라내고, 그 trace의 subsegment 타임라인에서 어느 다운스트림 호출이 시간을 잡아먹었는지 본다. 평균 알람 추가(A)는 꼬리를 못 보고, Reservoir·Group은 무관하다.

---

**문제 6.** 한 다운스트림 서비스의 fault rate가 평소 0.1%에서 서서히 올랐지만 고정 임계값(5%) 아래라 CloudWatch 알람이 안 울렸다. 이 "절대값은 낮지만 평소 대비 비정상"인 초기 열화를 잡는 도구는?

A) 고정 임계값을 1%로 낮춘다

B) X-Ray Insights — baseline(평소 fault rate)을 학습해 비정상 상승을 탐지하고 EventBridge로 알림

C) Reservoir 증설

D) Service Map을 더 자주 새로고침

**정답: B**

해설: 고정 임계값 알람은 "절대값은 낮지만 평소 대비 비정상"인 초기 열화를 놓친다. X-Ray Insights는 서비스별 정상 baseline(fault rate)을 학습해 baseline 대비 이상 상승을 탐지하고 Insight를 생성, EventBridge로 발행해 자동 알림·대응을 연결한다. 임계값을 무작정 낮추면(A) 정상 변동에도 거짓 알람이 폭증한다. baseline 학습 탐지가 고정 임계값의 사각지대를 보완하며, 둘은 보완 관계다.

---

**문제 7.** Powertools Tracer에서 `POWERTOOLS_TRACER_CAPTURE_RESPONSE=false`로 설정하는 주된 이유는?

A) 추적을 완전히 끈다

B) 큰 응답 페이로드를 metadata로 캡처하지 않아 trace 크기와 비용을 줄인다

C) annotation 검색을 빠르게 한다

D) 샘플링 비율을 높인다

**정답: B**

해설: 기본적으로 Powertools Tracer는 함수 응답을 metadata로 캡처하는데, 응답 페이로드가 크면 trace 크기가 부풀어 저장·전송 비용이 는다. `CAPTURE_RESPONSE=false`는 이 캡처를 꺼서 비용을 줄인다. "검색하지 않을 큰 데이터는 굳이 trace에 싣지 마라"는 원리의 비용 측면이다. 추적을 끄는 것(A)이 아니라 응답 캡처만 끄며, annotation 검색(C)·샘플링(D)과는 무관하다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 샘플링은 추적의 필수 전제이고 X-Ray는 Reservoir(초당 최소 보장, 통계학의 reservoir sampling에서 유래) + FixedRate(초과분 비율)로 저트래픽 가시성과 비용을 동시에 잡는다. 둘째, X-Ray는 head-based 샘플링(입구에서 결정·전파)이라 단순·저오버헤드지만 결과 기반 선택이 불가능하며, "에러·느린 trace만 100% 유지"는 ADOT의 tail-based 샘플링으로 보완한다. 셋째, Priority는 규칙 평가 순서(낮은 숫자 먼저, 구체적 규칙 우선, Default 9000은 마지막)이고 reservoir는 계정·리전 전체에서 분산 조율되어 인스턴스 수와 무관하게 총합이 유지된다. 넷째, Group으로 거대한 Service Map을 슬라이스하고 검색 표현식으로 outlier(tail latency·에러 trace)를 질의하되 annotation으로 넣은 필드만 검색된다. 다섯째, X-Ray Insights는 baseline 학습으로 "절대값은 낮지만 비정상"인 초기 열화를 탐지해 고정 임계값의 사각지대를 메운다.
