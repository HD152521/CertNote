# Day 3 - Container Insights·Lambda Insights·EMF: 워크로드별 관찰성의 깊은 이야기

옵저버빌리티(observability)라는 말은 제어 이론에서 왔다. 1960년 칼만(Rudolf Kálmán)이 정의한 개념으로, "시스템의 출력만 보고 내부 상태를 얼마나 추론할 수 있는가"를 뜻한다. 소프트웨어에 옮기면 — 로그·메트릭·추적이라는 외부 출력만으로 "지금 시스템 안에서 무슨 일이 벌어지는가"를 얼마나 알 수 있느냐다. 그런데 워크로드 종류가 다르면 "내부 상태"의 성질도 다르다. 컨테이너는 클러스터·노드·파드의 자원 경쟁이 핵심이고, Lambda는 콜드 스타트와 메모리 한계가 핵심이며, 비즈니스 로직은 주문 수·실패율 같은 도메인 지표가 핵심이다. 한 가지 계측으로 다 덮을 수 없다.

오늘은 이 워크로드별 관찰성을 깊이 본다. Container Insights가 ECS/EKS에서 무엇을 어떻게 수집하는지, Lambda Insights가 왜 별도 Extension/Layer로 동작하는지, EMF의 다중 차원 조합이 내부적으로 어떻게 여러 메트릭을 만드는지, Powertools가 무엇을 표준화하는지, 그리고 모든 관찰성 결정의 그림자인 카디널리티와 비용을 파고든다. DOP 시험에서 이 영역은 "EKS Pod별 메트릭", "콜드 스타트 분석", "Lambda 메트릭 비용 절감", "고카디널리티 비용 폭탄" 같은 시나리오로 자주 나온다.

## 관찰성의 세 기둥과 워크로드별 변주

옵저버빌리티는 흔히 **세 기둥 — 로그(Logs)·메트릭(Metrics)·추적(Traces)** 으로 말한다. 로그는 개별 이벤트의 상세 기록(고카디널리티, 사후 검색), 메트릭은 수치의 시계열 집계(저카디널리티, 실시간 알람), 추적은 한 요청이 여러 서비스를 거치는 경로(인과 연결)다. 세 기둥은 같은 시스템을 다른 각도로 본다.

워크로드별로 이 세 기둥의 무게중심이 다르다. **컨테이너**는 메트릭(클러스터/노드/파드의 CPU·메모리 경쟁)이 무겁고, **Lambda**는 메트릭(콜드 스타트·init duration·메모리 사용)과 추적(짧게 떴다 사라지는 함수 체인)이 무거우며, **비즈니스 로직**은 도메인 메트릭(주문·결제)과 로그(주문 ID별 상세)가 무겁다. Container Insights·Lambda Insights·EMF는 각각 이 무게중심에 맞춘 도구다.

> 💡 **관련 이론**: "세 기둥" 모델은 옵저버빌리티의 출발점이지만 한계도 있다. Honeycomb의 Charity Majors 등은 "세 기둥은 저장소가 셋으로 쪼개진 사일로를 만든다"고 비판하며, 대신 **고카디널리티·고차원의 넓은 이벤트(wide structured events)** 하나에서 세 신호를 파생하자고 주장한다. 이 관점에서 EMF는 의미가 깊다 — 하나의 로그 이벤트 안에 메트릭(`_aws` 블록)과 상세 필드(로그)를 함께 담아 사일로를 줄인다. OpenTelemetry가 로그·메트릭·추적을 하나의 SDK·하나의 컨텍스트로 통합하려는 것도 같은 방향이다. "세 기둥이냐 하나의 넓은 이벤트냐"는 현대 옵저버빌리티 설계의 핵심 논쟁이다.

## Container Insights — 클러스터의 자원 경쟁을 보다

컨테이너 워크로드의 핵심 질문은 "어느 파드가 노드 자원을 잡아먹나", "Task가 OOM으로 죽나", "서비스가 원하는 만큼 떠 있나"다. Container Insights는 ECS/EKS의 클러스터·서비스·Task·파드 수준 메트릭을 자동 수집한다.

```bash
# ECS — 클러스터 설정에서 활성화
aws ecs update-cluster-settings \
  --cluster prod --settings name=containerInsights,value=enabled
```

EKS에서는 보통 **ADOT(AWS Distro for OpenTelemetry) Collector** 또는 CloudWatch Agent를 DaemonSet으로 설치한다(노드마다 한 개씩 떠서 그 노드의 파드 메트릭을 수집). 수집되는 것은:

- **ECS**: ServiceCount, TaskCount, CPUUtilization, MemoryUtilization, NetworkRxBytes
- **EKS**: cluster_failed_node_count, pod_cpu_utilization, pod_memory_utilization, namespace별 집계

활성화 위치가 시험 포인트다. ECS는 **클러스터 설정**에서 켜고(Task Definition이나 Service가 아니다), EKS는 **수집 에이전트를 클러스터에 배포**한다.

> 🔍 **더 깊이**: EKS에서 Container Insights를 켠다는 건 실제로는 **DaemonSet으로 수집 에이전트를 노드마다 배치**하는 것이다. 왜 DaemonSet인가? 파드 메트릭은 그 파드가 떠 있는 노드의 kubelet/cAdvisor에서 읽어야 하므로, 수집기가 모든 노드에 하나씩 있어야 빠짐없이 긁는다. cAdvisor(Google이 만든 컨테이너 자원 분석기)가 노드 위 컨테이너의 CPU·메모리·네트워크·파일시스템을 측정하고, kubelet이 이를 노출하면, 에이전트(ADOT/CloudWatch Agent/Fluent Bit)가 수집해 CloudWatch로 보낸다. 이는 Prometheus의 node-exporter + kube-state-metrics + cAdvisor 조합이 하는 일과 정확히 같은 계보다. "노드마다 수집기"라는 DaemonSet 패턴은 클러스터 관찰성의 보편 구조다.

> 📚 **사례**: 한 팀이 작은 EKS 클러스터(노드 3개)에 Container Insights를 켰는데, 이후 CloudWatch 비용이 컴퓨트 비용에 육박했다. 원인은 Container Insights가 클러스터·노드·파드·컨테이너 차원으로 대량의 메트릭과 성능 로그를 자동 생성하는데, 파드가 자주 떴다 사라지면서(배치 잡) 메트릭 차원이 계속 늘어났기 때문이다. 작은 클러스터에서는 관찰성 데이터가 워크로드 자체보다 비쌀 수 있다. 교훈: Container Insights는 강력하지만 공짜가 아니다 — 클러스터 규모와 파드 수명 패턴에 따라 비용을 먼저 가늠하고, 필요하면 enhanced observability 대신 기본 메트릭만, 또는 핵심 네임스페이스만 켜는 식으로 범위를 좁혀야 한다.

## Lambda Insights — 콜드 스타트와 메모리의 진실

Lambda의 기본 메트릭(Invocations, Errors, Duration, Throttles)은 함수가 "얼마나 호출되고 얼마나 실패하나"는 보여주지만, "왜 느린가"는 못 보여준다. 콜드 스타트가 얼마나 자주 일어나는지, 메모리를 얼마나 쓰는지, init 단계가 얼마나 걸리는지 — 이 내부 상태는 **Lambda Insights**가 본다.

```
# Lambda Insights Extension Layer 추가
arn:aws:lambda:<region>:580247275435:layer:LambdaInsightsExtension:<N>
# + IAM: CloudWatchLambdaInsightsExecutionRolePolicy
```

Lambda Insights는 **Lambda Extension**(별도 레이어)으로 동작한다. 함수 코드와 같은 실행 환경 안에서 사이드카처럼 떠서 CPU·메모리·네트워크·디스크와 init duration(콜드 스타트 시간)을 측정해 `/aws/lambda-insights` 로그 그룹으로 보내고, CloudWatch 콘솔에 멀티함수 대시보드를 자동으로 그린다.

콜드 스타트 분석이 핵심 가치다. **init duration** 메트릭으로 콜드 스타트가 응답 지연에 얼마나 기여하는지 정량화하고, Provisioned Concurrency를 켰을 때 그 효과를 검증한다. "메모리를 올렸더니 빨라졌다"가 진짜인지(메모리 ∝ CPU라 그럴 수 있다)도 메모리 사용 메트릭으로 확인한다.

> 🔍 **더 깊이**: Lambda Insights가 **Extension(레이어)으로 동작하는 이유**는 Lambda 실행 모델 때문이다. Lambda 함수는 호출이 끝나면 동결(freeze)되고, 다음 호출까지 코드가 멈춘다 — 함수 코드 안에서 백그라운드로 메트릭을 모아 주기적으로 전송하는 게 불가능하다. Extension은 함수 핸들러와 독립된 별도 프로세스라 함수가 동결돼도 init·invoke·shutdown 라이프사이클 훅을 받아 동작할 수 있고, 그래서 콜드 스타트의 init 단계까지 측정한다. 이는 사이드카 패턴(sidecar pattern)의 서버리스 버전이다 — 쿠버네티스에서 애플리케이션 컨테이너 옆에 관찰성/프록시 컨테이너를 붙이듯, Lambda는 함수 옆에 Extension을 붙인다. ADOT, Datadog, New Relic의 Lambda 통합이 모두 이 Extension 메커니즘 위에 서 있다.

## EMF — 다중 차원 조합의 내부 동작

어제와 그제 EMF를 봤지만, 오늘은 가장 정교한 부분 — **다중 차원 조합(multiple dimension sets)** 을 판다. EMF가 PutMetricData보다 우월한 결정적 지점이 여기다.

```json
{
  "_aws": {
    "Timestamp": 1716368400000,
    "CloudWatchMetrics": [{
      "Namespace": "MyApp/Orders",
      "Dimensions": [
        ["Service", "Environment"],
        ["Service"],
        []
      ],
      "Metrics": [
        {"Name": "OrderCount", "Unit": "Count"},
        {"Name": "OrderValue", "Unit": "None"}
      ]
    }]
  },
  "Service": "checkout",
  "Environment": "prod",
  "OrderCount": 1,
  "OrderValue": 42.5,
  "OrderId": "ord-abc-123"
}
```

`Dimensions`가 배열의 배열이라는 게 핵심이다. 이 한 번의 로그 출력이 OrderCount에 대해 **세 개의 별도 메트릭**을 만든다:

- `[Service, Environment]` → `{checkout, prod}`별로 분리된 메트릭
- `[Service]` → checkout 전체로 집계된 메트릭(환경 무관)
- `[]` → 전 서비스 합산 메트릭

어제 배운 원칙 — "CloudWatch는 publish 시점에 정한 차원 조합으로만 집계를 제공한다" — 이 여기서 빛난다. 나중에 "환경 무시하고 서비스별로만" 보고 싶을 걸 안다면, publish 때 `[Service]` 조합을 함께 넣어둬야 한다. EMF는 이 조합들을 한 출력으로 다 넣을 수 있고, PutMetricData는 조합마다 호출해야 한다.

그리고 `OrderId`는 `Metrics`에도 `Dimensions`에도 없다 — 페이로드 최상위에 있을 뿐이다. 그래서 **메트릭이 되지 않고 로그 필드로만 남아** Logs Insights에서 검색된다. 고카디널리티 식별자를 메트릭에서 빼고 로그로 보내는 이 분리가 EMF 설계의 핵심이다.

> 💡 **관련 이론**: EMF의 다중 차원 조합은 데이터 큐브의 **사전 집계(pre-aggregation / roll-up)** 와 같은 발상이다. OLAP(온라인 분석 처리)에서 데이터 큐브를 만들 때, 모든 차원 조합(`{Service,Environment}`, `{Service}`, `{Environment}`, `{}`)을 미리 계산해두면 어떤 관점의 질의든 빠르게 응답한다. 이를 큐브의 "셀(cell)"이라 하고, 모든 조합을 미리 만드는 것을 full materialization이라 한다. CloudWatch 메트릭은 사후 임의 집계가 안 되므로(스트리밍 시계열의 한계), EMF는 필요한 집계 관점을 publish 시점에 미리 materialize한다. 트레이드오프는 명확하다 — 조합을 많이 넣을수록 질의는 유연하지만 메트릭 수(=비용)가 는다. "어떤 집계 관점이 실제로 필요한가"를 미리 정하는 것이 EMF 설계의 핵심 결정이다.

## Powertools — 관찰성의 표준화 레이어

EMF·구조화 로그·X-Ray를 직접 짜면 보일러플레이트가 많고 팀마다 형식이 갈린다. **Powertools for AWS Lambda**는 이 셋을 데코레이터 한 줄씩으로 표준화한다.

```python
from aws_lambda_powertools import Logger, Tracer, Metrics
from aws_lambda_powertools.metrics import MetricUnit

logger = Logger(service="checkout")
tracer = Tracer()
metrics = Metrics(namespace="MyApp", service="checkout")

@logger.inject_lambda_context(correlation_id_path="requestContext.requestId")
@tracer.capture_lambda_handler
@metrics.log_metrics(capture_cold_start_metric=True)
def handler(event, context):
    metrics.add_metric(name="OrderCount", unit=MetricUnit.Count, value=1)
    metrics.add_dimension(name="Region", value="ap-northeast-2")
    logger.info("Order received", extra={"order_id": event["order_id"]})
    ...
```

세 데코레이터가 자동으로 만들어내는 것: **구조화 JSON 로그 + correlation ID**(요청을 로그·메트릭·추적에 걸쳐 추적), **X-Ray 세그먼트와 메타데이터**, **EMF 메트릭 + 콜드 스타트 메트릭 자동**(`capture_cold_start_metric=True`). 팀이 형식을 고민할 필요 없이 같은 관찰성 표준을 공유한다.

> 🔍 **더 깊이**: Powertools가 강제하는 **correlation ID**(상관 ID)는 분산 추적의 토대다. 한 요청이 API Gateway → Lambda → SQS → 다른 Lambda → DynamoDB를 거칠 때, 같은 요청에서 나온 로그·메트릭·추적을 하나로 묶으려면 공통 ID가 모든 신호에 박혀 있어야 한다. 이는 W3C Trace Context 표준(`traceparent` 헤더)이 정의하는 trace ID·span ID 개념과 같고, Google Dapper 논문(2010)이 대중화한 분산 추적의 핵심 아이디어다. correlation ID 없는 로그는 분산 시스템에서 "어느 요청의 로그인지" 알 수 없어 사실상 디버깅이 불가능하다. Powertools가 이를 데코레이터로 자동 주입하는 것은 "관찰 가능한 시스템의 최소 요건"을 코드에 강제하는 것이다.

## 카디널리티 — 모든 관찰성 결정의 그림자

지금까지 반복해서 나온 단어가 카디널리티다. 이것이 관찰성 비용의 핵심 변수이자 가장 흔한 사고 원인이다.

```json
"Dimensions": [["UserId"]]   // ⚠️ 사용자 수만큼 메트릭이 생성됨
```

`UserId`를 차원으로 두면, 사용자가 100만 명이면 시계열이 100만 개 생긴다. CloudWatch는 고유 차원 조합마다 별도 메트릭으로 과금하므로 비용이 폭발한다. 더 나쁜 건 이런 고카디널리티 메트릭이 대시보드·알람에서도 쓸모없다는 점이다 — 100만 개의 개별 시계열은 추세를 못 보여준다.

원칙은 **차원에는 저카디널리티만, 고카디널리티는 로그 필드로**다:

- 차원(메트릭): Region, Service, Environment, StatusCode 등 값의 종류가 적은 것
- 로그 필드(검색): UserId, OrderId, RequestId, SessionId 등 거의 무한히 다양한 것

UserId별 분석이 필요하면 메트릭이 아니라 Logs Insights에서 `filter user_id = "..."`로 검색한다.

> ⚠️ **함정**: 가장 교묘한 카디널리티 폭탄은 **에러 메시지나 URL 경로를 차원으로 넣는 것**이다. 예를 들어 메트릭 차원에 `path`를 넣었는데 경로에 `/orders/{order_id}`처럼 ID가 박혀 들어가면, 주문마다 다른 경로가 되어 사실상 무한 카디널리티가 된다. 마찬가지로 에러 메시지에 타임스탬프나 ID가 섞여 있으면 메시지마다 다른 차원이 된다. 해법은 차원으로 쓰기 전에 **정규화(normalization)** 하는 것이다 — `/orders/{id}`처럼 변수 부분을 플레이스홀더로 치환해 카디널리티를 유한하게 만든다. Prometheus 운영에서도 동일하게 "레이블에 ID·이메일·URL 원본을 넣지 마라"가 1번 규칙이다. "이 차원의 고유값이 시간이 지나며 무한정 늘어나는가?"를 항상 자문해야 한다.

## Cost vs Visibility — 관찰성의 근본 트레이드오프

관찰성은 공짜가 아니다. 더 많이 볼수록 더 비싸다. 이 트레이드오프를 의식적으로 다루는 게 운영 성숙도다.

| 데이터 | 비용 영향 | 가치 | 권장 |
|--------|-----------|------|------|
| 모든 요청에 EMF 메트릭 | 메트릭 수 ↑(차원 따라) | 즉각 알람 | 저카디널리티 차원만 |
| 모든 요청 X-Ray 추적 | 추적 수 ↑ | 강력한 디버깅 | 샘플링 적용 |
| 샘플링 X-Ray(5%) | 절감 | 통계적으로 충분 | 고트래픽 표준 |
| 5분 단위 비즈니스 메트릭 | 저렴 | 트렌드 추적 | 항상 |

핵심 패턴은 **샘플링과 집계**다. 모든 추적을 다 수집할 필요는 없다 — 5%만 샘플링해도 통계적 패턴은 충분히 드러나고, 에러는 별도로 100% 샘플링하면 디버깅에 필요한 건 다 잡는다. 시험에서 "트래픽 폭증 + 관찰성 비용 폭증"이 나오면 답은 거의 항상 "샘플링 + 집계 + 카디널리티 축소"다.

> 🎯 **시나리오**: "트래픽이 10배로 늘자 X-Ray와 커스텀 메트릭 비용이 폭증했다. 디버깅 능력은 유지하면서 비용을 잡고 싶다." — 답은 계층적 샘플링 + 카디널리티 점검이다. (1) X-Ray는 고정 비율 샘플링(예: 5%) + 에러/고지연 요청은 별도 규칙으로 높은 비율 수집 — 정상 트래픽은 통계로 충분하고 문제 요청은 놓치지 않는다. (2) 커스텀 메트릭의 차원을 점검해 UserId·OrderId·원본 URL 같은 고카디널리티 차원을 로그 필드로 강등한다. (3) 초당 단위 고해상도 메트릭이 꼭 필요한지 재검토해 표준 60초로 내린다. "전수 수집"에서 "대표 표본 + 예외 전수"로 바꾸는 것이 핵심이다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **관찰성의 세 기둥(로그·메트릭·추적)은 워크로드별로 무게중심이 다르고**, EMF/OpenTelemetry는 이를 넓은 이벤트 하나로 통합하려는 흐름이다. 둘째, **Container Insights는 DaemonSet 수집기로 클러스터/노드/파드 자원을 보며**(ECS는 클러스터 설정, EKS는 에이전트 배포), 작은 클러스터에선 관찰성 비용이 워크로드를 넘을 수 있다. 셋째, **Lambda Insights는 Extension(사이드카) 패턴**으로 함수가 동결돼도 콜드 스타트 init까지 측정한다. 넷째, **EMF의 다중 차원 조합은 OLAP의 사전 집계**처럼 필요한 집계 관점을 publish 시점에 materialize하고, 고카디널리티는 로그 필드로 분리한다. 다섯째, **카디널리티는 비용의 핵심 변수**라 차원에는 저카디널리티만 넣고, ID·URL은 정규화하거나 로그로 보내며, Cost vs Visibility는 샘플링+집계로 다룬다.

다음 글에서는 사용자 경험 측정 — Synthetics(외부 프로브), RUM(실사용자), Evidently(A/B 실험)를 깊이 본다. "시스템이 건강한가"에서 "사용자가 실제로 좋은 경험을 하는가"로 관찰의 초점이 옮겨간다.

---

## 📝 연습 문제

**문제 1.** Lambda 함수에 사용자 정의 메트릭을 가장 효율적으로 게시하면서 같은 데이터를 여러 집계 관점으로도 보려면?

A) PutMetricData를 차원 조합마다 호출
B) EMF — 로그에 메트릭을 임베드하고 `Dimensions` 배열의 배열로 다중 차원 조합을 한 번에 게시
C) Container Insights 활성화
D) Lambda Insights Layer 추가

**정답: B**

해설: EMF는 메트릭 API 호출 없이 로그 JSON에 메트릭을 임베드하고, `Dimensions`를 배열의 배열로 받아 한 번의 출력으로 여러 차원 조합(예: `[Service,Environment]`, `[Service]`, `[]`)을 동시에 게시한다. CloudWatch는 publish 시점 차원 조합으로만 집계하므로 이 다중 조합이 사후 다양한 관점 조회를 가능하게 한다. PutMetricData(A)는 조합마다 호출이 필요해 비효율적이고, Container/Lambda Insights(C/D)는 자원 메트릭 수집 도구로 커스텀 메트릭 게시 수단이 아니다.

---

**문제 2.** EKS 클러스터에서 파드별 CPU·메모리 메트릭을 자동 수집하려면?

A) Task Definition에 설정
B) ECS 클러스터 설정 활성화
C) Container Insights를 위해 ADOT/CloudWatch Agent를 DaemonSet으로 노드마다 배포
D) Lambda Insights Layer

**정답: C**

해설: EKS는 파드 메트릭을 그 파드가 떠 있는 노드에서 읽어야 하므로 수집 에이전트(ADOT Collector 또는 CloudWatch Agent)를 DaemonSet으로 모든 노드에 하나씩 배포한다. cAdvisor/kubelet이 노출하는 컨테이너 자원 데이터를 에이전트가 긁어 CloudWatch로 보낸다. Task Definition(A)·ECS 클러스터 설정(B)은 ECS용이고, Lambda Insights(D)는 Lambda 전용이다.

---

**문제 3.** Lambda 콜드 스타트가 응답 지연에 얼마나 기여하는지, Provisioned Concurrency 효과를 검증하려면?

A) Container Insights
B) Lambda Insights — init duration 메트릭으로 콜드 스타트 정량화
C) Synthetics
D) CloudTrail

**정답: B**

해설: Lambda Insights는 Extension으로 동작해 함수가 동결돼도 init·invoke 라이프사이클을 측정하며, init duration 메트릭으로 콜드 스타트 시간을 정량화한다. 이를 통해 콜드 스타트의 지연 기여도와 Provisioned Concurrency 적용 효과를 검증한다. Container Insights(A)는 컨테이너용, Synthetics(C)는 외부 프로브, CloudTrail(D)은 API 감사 로그라 콜드 스타트 내부 측정과 무관하다.

---

**문제 4.** EMF 페이로드에서 `OrderId`를 `Dimensions`나 `Metrics`에 넣지 않고 최상위 필드로만 두는 이유는?

A) 실수다 — 차원에 넣어야 한다
B) 고카디널리티 식별자를 메트릭에서 빼 로그 필드로만 남겨 Logs Insights에서 검색 — 메트릭 카디널리티 폭발 방지
C) 보안상 숨기려고
D) 단위가 없어서

**정답: B**

해설: OrderId는 주문마다 고유한 고카디널리티 값이라 차원으로 넣으면 시계열이 무한정 늘어 비용이 폭발한다. EMF는 메트릭(저카디널리티 집계)과 로그(고카디널리티 상세)를 분리하는 설계라, OrderId를 최상위 필드로만 두어 메트릭은 만들지 않고 로그 필드로 보존해 Logs Insights에서 검색한다. 이것이 EMF 설계의 핵심 의도다.

---

**문제 5.** 메트릭 차원에 URL `path`를 넣었더니 `/orders/{order_id}`처럼 ID가 박혀 카디널리티가 폭발했다. 가장 적절한 해법은?

A) 차원을 더 추가
B) path를 정규화 — 변수 부분을 `/orders/{id}` 플레이스홀더로 치환해 카디널리티를 유한하게
C) High-Resolution Metric으로 전환
D) retention 단축

**정답: B**

해설: 경로에 ID가 박히면 요청마다 다른 차원값이 되어 사실상 무한 카디널리티가 된다. 차원으로 쓰기 전에 변수 부분(order_id)을 `{id}` 같은 플레이스홀더로 정규화하면 경로 패턴 수가 유한해져 카디널리티가 통제된다. Prometheus 레이블 운영의 핵심 규칙과 동일하다. 차원 추가(A)는 악화시키고, 해상도(C)·retention(D)은 카디널리티와 무관하다.

---

**문제 6.** 트래픽 10배 증가로 X-Ray·커스텀 메트릭 비용이 폭증했다. 디버깅 능력을 유지하며 비용을 잡으려면?

A) 모든 추적·메트릭 수집 중단
B) X-Ray 고정 비율 샘플링(예: 5%) + 에러/고지연은 높은 비율로 별도 수집, 고카디널리티 차원을 로그 필드로 강등
C) 리전 변경
D) Lambda 메모리 축소

**정답: B**

해설: "전수 수집 → 대표 표본 + 예외 전수"가 핵심이다. 정상 트래픽은 5% 샘플링으로 통계적 패턴을 잡고, 에러·고지연 요청은 별도 규칙으로 높은 비율 수집해 디버깅에 필요한 것을 놓치지 않는다. 동시에 UserId·OrderId·원본 URL 같은 고카디널리티 차원을 로그 필드로 강등해 메트릭 비용을 줄인다. 수집 중단(A)은 가시성을 잃고, 리전(C)·메모리(D)는 관찰성 비용과 무관하다.

---

**문제 7.** Powertools for AWS Lambda가 데코레이터로 자동 제공하지 않는 것은?

A) 구조화 JSON 로그 + correlation ID
B) X-Ray 세그먼트와 메타데이터
C) EMF 메트릭 + 콜드 스타트 메트릭
D) IAM Role 자동 생성

**정답: D**

해설: Powertools는 `@logger.inject_lambda_context`(구조화 로그 + correlation ID), `@tracer.capture_lambda_handler`(X-Ray 세그먼트), `@metrics.log_metrics`(EMF 메트릭 + 콜드 스타트)를 데코레이터로 자동화한다. 그러나 IAM Role/정책은 인프라 권한이라 IaC(CloudFormation/CDK/Terraform)로 별도 설정해야 하며 Powertools가 만들어주지 않는다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 관찰성의 세 기둥(로그·메트릭·추적)은 워크로드별 무게중심이 다르고 EMF/OpenTelemetry는 넓은 이벤트로 통합하려는 흐름이다. 둘째, Container Insights는 DaemonSet 수집기(cAdvisor/kubelet)로 클러스터/노드/파드 자원을 보며 ECS는 클러스터 설정, EKS는 에이전트 배포로 켜고 작은 클러스터에선 관찰성 비용이 워크로드를 넘을 수 있다. 셋째, Lambda Insights는 Extension 사이드카 패턴으로 함수 동결 중에도 콜드 스타트 init duration을 측정한다. 넷째, EMF의 다중 차원 조합은 OLAP 사전 집계처럼 필요한 집계 관점을 publish 시점에 materialize하고 고카디널리티 식별자는 로그 필드로 분리한다. 다섯째, 카디널리티는 비용의 핵심 변수라 차원에는 저카디널리티만, ID·URL은 정규화하며, Cost vs Visibility는 샘플링(정상 5% + 예외 전수)과 집계로 다룬다.
