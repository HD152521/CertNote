# Day 3 - ADOT: OpenTelemetry가 끝낸 추적 도구 전쟁의 깊은 이야기

2010년대 중반, 분산 추적은 좋은 아이디어였지만 운영팀에게는 악몽이기도 했다. Zipkin, Jaeger, X-Ray, Datadog, New Relic, Dynatrace — 각자 자기만의 SDK, 자기만의 데이터 포맷, 자기만의 전파 헤더를 가졌다. 한 회사가 X-Ray로 시작했다가 Datadog으로 옮기려면 모든 서비스의 계측 코드를 처음부터 다시 써야 했다. 추적 라이브러리가 비즈니스 코드 깊숙이 박혀 있으니, 도구를 바꾸는 비용이 도구를 쓰는 가치를 넘어섰다. 이 **벤더 락인(vendor lock-in)**이 분산 추적 확산의 가장 큰 걸림돌이었다. OpenTelemetry는 이 문제를 표준화로 풀었고, ADOT는 그 표준의 AWS 공식 배포판이다.

오늘은 ADOT를 단순히 "AWS의 OTel 패키지"로 보지 않고, 표준화가 어떤 정치적·기술적 합종연횡으로 탄생했는지, Collector의 receiver-processor-exporter 파이프라인이 왜 추적 데이터 처리의 보편 아키텍처가 됐는지, ADOT가 X-Ray SDK와 무엇이 근본적으로 다른지를 판다. DOP 시험에서 ADOT는 "멀티 클라우드/멀티 백엔드 관찰성을 표준화하라", "EKS 메트릭을 Prometheus 호환으로 수집하라", "코드 변경 없이 자동 계측하라" 같은 시나리오로 점점 자주 나온다.

## OpenTelemetry의 탄생 — 두 표준의 합병

OpenTelemetry의 역사는 흥미롭게도 **두 경쟁 프로젝트의 합병**이다. 2016년경 추적 계측을 표준화하려는 **OpenTracing**(CNCF, API 표준에 집중)과, 구글이 주도해 자동 계측까지 포함한 **OpenCensus**(라이브러리+에이전트)가 따로 존재했다. 둘은 같은 문제를 다르게 풀어 시장을 분열시켰다. 2019년, CNCF 주도로 이 둘이 **OpenTelemetry**로 합병했다 — OpenTracing의 API 추상화와 OpenCensus의 구현·자동 계측을 합친 것이다. 이로써 "계측 API는 표준화하고(OpenTracing 유산), 자동 계측과 Collector는 구현으로 제공(OpenCensus 유산)"하는 지금의 OTel이 됐다.

OTel의 핵심 약속은 **계측과 백엔드의 분리(decoupling)**다. 코드는 OTel API로만 계측하고, "이 데이터를 X-Ray로 보낼지 Datadog으로 보낼지"는 설정(exporter)으로 나중에 정한다. 도구를 바꿔도 비즈니스 코드는 그대로다. 이것이 벤더 락인을 푼 핵심 발상이다.

> 💡 **관련 이론**: OTel의 "API와 구현의 분리"는 소프트웨어 공학의 고전 원리인 **의존성 역전 원칙(DIP, Dependency Inversion Principle)**의 인프라 버전이다. 애플리케이션은 구체적인 벤더 SDK(저수준 모듈)가 아니라 OTel API(추상)에 의존하고, 어떤 백엔드로 보낼지는 런타임 설정으로 주입된다. 같은 패턴이 곳곳에 있다 — SLF4J는 로깅 API를 표준화하고 Logback/Log4j는 구현으로 갈아끼우며, JDBC는 DB 접근을 표준화하고 드라이버를 갈아끼운다. OTel은 텔레메트리 계층에 이 어댑터/파사드 패턴을 적용해, "계측은 한 번, 백엔드는 자유롭게"를 실현했다. 표준이 승리하는 전형적 메커니즘 — 충분히 많은 벤더가 자기 SDK를 포기하고 공통 표준의 exporter만 제공하기로 합의하면, 그 표준이 사실상의 산업 표준이 된다.

## 세 신호(signals)의 통합 — logs, metrics, traces

OTel의 또 다른 야심은 옵저버빌리티의 **세 기둥(three pillars)** — 로그(logs), 메트릭(metrics), 추적(traces) — 을 하나의 표준·하나의 파이프라인으로 통합하는 것이다. 전통적으로 이 셋은 별개 도구·별개 SDK였다(Fluentd for logs, Prometheus for metrics, Jaeger for traces). OTel은 이들을 공통 데이터 모델과 공통 전송 프로토콜(**OTLP**, OpenTelemetry Protocol)로 묶는다.

핵심 가치는 **상관관계(correlation)**다. 세 신호가 같은 trace ID·resource 속성을 공유하면, "이 에러 로그 → 이 trace → 이 시점의 메트릭 스파이크"를 자동으로 잇는다. 신호가 분리된 도구에 흩어져 있으면 이 연결을 사람이 수동으로 맞춰야 한다.

```yaml
# ADOT Collector — 세 신호를 받아 여러 백엔드로
receivers:
  otlp:
    protocols: { grpc: {}, http: {} }
  prometheus:
    config:
      scrape_configs:
        - job_name: app
          static_configs: [{ targets: ['localhost:8080'] }]
processors:
  batch: {}
  resource:
    attributes:
      - { key: service.environment, value: prod, action: insert }
exporters:
  awsxray: { region: ap-northeast-2 }
  awsemf:  { namespace: MyApp/OTel, region: ap-northeast-2 }
  prometheusremotewrite:
    endpoint: https://aps-workspaces.../api/v1/remote_write
    auth: { authenticator: sigv4auth }
  otlp/jaeger:
    endpoint: jaeger:4317
    tls: { insecure: true }
service:
  pipelines:
    traces:  { receivers: [otlp], processors: [batch, resource], exporters: [awsxray, otlp/jaeger] }
    metrics: { receivers: [otlp, prometheus], processors: [batch], exporters: [awsemf, prometheusremotewrite] }
```

## Collector 파이프라인 — receiver, processor, exporter

ADOT의 심장은 **Collector**다. 그 구조는 세 단계 파이프라인으로 단순하면서 강력하다.

- **Receivers**: 데이터를 받아들이는 입구. OTLP(gRPC/HTTP), Prometheus scrape, StatsD, Zipkin, Jaeger 등 다양한 포맷을 받는다.
- **Processors**: 받은 데이터를 가공. `batch`(전송 효율을 위한 배치 묶기), `resource`(공통 속성 추가), `filter`(불필요 데이터 제거), `tail_sampling`(Day 2의 결과 기반 샘플링), `attributes`(PII 마스킹) 등.
- **Exporters**: 가공된 데이터를 백엔드로 내보내기. X-Ray, EMF/CloudWatch, AMP, Jaeger, OpenSearch, OTLP 등.

이 셋을 `service.pipelines`에서 신호별(traces/metrics/logs)로 조립한다. 같은 데이터를 **여러 exporter로 동시에 fan-out**할 수 있다 — 위 예시는 trace를 X-Ray와 Jaeger 양쪽에 보낸다(마이그레이션 중 두 도구를 병행할 때 핵심).

> 🔍 **더 깊이**: Collector의 receiver-processor-exporter 파이프라인은 새로운 발명이 아니라 **ETL(Extract-Transform-Load)** 또는 **파이프-필터 아키텍처(pipes and filters)**의 텔레메트리 버전이다. Unix 파이프라인(`cat | grep | sort`), Logstash의 input-filter-output, Fluentd의 source-filter-match, Kafka Connect의 source-transform-sink가 모두 같은 구조다. 핵심 이점은 **조합성(composability)** — 각 단계가 독립적이라 receiver만 바꾸거나 processor를 끼워 넣어도 나머지가 영향받지 않는다. processor 체인에 `attributes` processor를 넣어 PII를 마스킹하거나, `filter`로 헬스체크 trace를 버리거나, `tail_sampling`으로 에러 trace만 남기는 식의 가공을 백엔드와 무관하게 한곳에서 할 수 있다. Collector를 "텔레메트리의 Logstash"로 이해하면 그 역할이 분명해진다.

> ⚠️ **함정**: Collector를 **agent 모드**(애플리케이션 옆 사이드카/DaemonSet)와 **gateway 모드**(중앙 집중 Collector 클러스터)로 배치하는 두 패턴을 혼동하면 안 된다. agent 모드는 각 노드/Pod 옆에서 받아 가공하므로 네트워크 지연이 낮지만 인스턴스마다 자원을 쓴다. gateway 모드는 모든 텔레메트리를 중앙 Collector로 모아 일괄 가공(tail-based 샘플링은 같은 trace의 모든 span이 한곳에 모여야 하므로 사실상 gateway가 필요)하지만 단일 장애점이 될 수 있다. 실무 권장은 **agent(수집·1차 가공) + gateway(tail 샘플링·라우팅)의 2계층**이다. tail-based 샘플링을 agent 모드에 두면 한 trace의 span들이 여러 agent에 흩어져 결과 기반 판단을 못 하는 흔한 실수가 생긴다.

## ADOT의 배포 형태 — Lambda부터 EKS까지

ADOT는 실행 환경마다 다른 형태로 제공된다.

- **Lambda Layer**: 가장 단순. Layer를 붙이고 환경 변수 하나만 설정하면 코드 변경 없이 자동 계측.
- **ECS Sidecar / EKS DaemonSet**: Collector를 컨테이너로 동거.
- **EC2 systemd 서비스**: 전통적 서버에.
- **EKS Add-on**: Operator + CRD로 선언적 관리.

```yaml
# SAM — Lambda ADOT Layer
Globals:
  Function:
    Tracing: Active
    Layers:
      - !Sub 'arn:aws:lambda:${AWS::Region}:901920570463:layer:aws-otel-python-amd64-ver-1-25-0:1'
    Environment:
      Variables:
        AWS_LAMBDA_EXEC_WRAPPER: /opt/otel-instrument
```

`AWS_LAMBDA_EXEC_WRAPPER: /opt/otel-instrument`가 마법의 한 줄이다. Lambda는 런타임을 시작하기 전에 이 wrapper 스크립트를 먼저 실행하는데, 이 스크립트가 OTel auto-instrumentation을 런타임에 주입한다. 즉 핸들러 코드는 한 줄도 안 바꾸고 OTel 계측이 붙는다.

> 💡 **관련 이론**: `AWS_LAMBDA_EXEC_WRAPPER`는 Lambda 런타임의 **wrapper script** 기능으로, 실제 런타임 부트스트랩을 가로채 앞단에 코드를 끼워 넣는 **인터셉션 패턴**이다. 같은 발상이 여러 곳에 있다 — JVM의 `-javaagent`(클래스 로딩 가로채기), `LD_PRELOAD`(공유 라이브러리 가로채기), 서블릿 필터 체인(요청 가로채기). 공통 원리는 "본체를 수정하지 않고 경계에서 횡단 관심사(cross-cutting concern, 여기선 계측)를 주입"하는 것 — AOP(관점 지향 프로그래밍)의 인프라 구현이다. 이 덕에 계측이 비즈니스 로직과 물리적으로 분리되어, 계측을 켜고 끄는 것이 배포 설정의 문제가 된다.

## ADOT vs X-Ray SDK — 무엇이 근본적으로 다른가

| 항목 | X-Ray SDK | ADOT (OpenTelemetry) |
|------|-----------|----------------------|
| 표준 | AWS 전용 | OpenTelemetry (CNCF 벤더 중립) |
| 백엔드 | X-Ray만 | X-Ray + Prometheus + Jaeger + Datadog + ... |
| 전파 헤더 | `X-Amzn-Trace-Id` | W3C `traceparent` (+ X-Ray 호환) |
| 신호 | 주로 traces | traces + metrics + logs 통합 |
| 멀티 클라우드 | 어려움 | 설계상 가능 |
| 계측 코드 변경 | SDK 호출 필요 | auto-instrumentation으로 0에 가까움 |

근본 차이는 **결합도**다. X-Ray SDK는 코드를 X-Ray에 묶고, ADOT는 코드를 표준에 묶어 백엔드를 자유롭게 한다. 다만 트레이드오프가 있다 — ADOT는 더 많은 구성요소(Collector 운영, propagator 설정)를 다뤄야 하고, X-Ray의 일부 깊은 기능(Insights 등)과의 통합은 X-Ray SDK가 더 매끄러울 수 있다. "지금 AWS만 쓰고 단순하면 X-Ray SDK, 멀티 백엔드·멀티 클라우드·벤더 중립이 필요하면 ADOT"가 결정 기준이다.

> 📚 **사례**: 한 회사가 온프레미스 Kubernetes에서 Jaeger로 추적하다가 AWS EKS로 마이그레이션하면서, "기존 Jaeger 대시보드를 당분간 유지하되 점진적으로 X-Ray로 옮기고 싶다"는 요구가 있었다. X-Ray SDK였다면 모든 서비스를 한 번에 X-Ray로 갈아타야 했지만, ADOT를 도입해 Collector의 trace 파이프라인 exporter에 `awsxray`와 `otlp/jaeger`를 둘 다 넣어 **같은 trace를 양쪽에 동시 전송**했다. 마이그레이션 기간 동안 두 도구를 병행하며 X-Ray 대시보드를 검증한 뒤, Jaeger exporter를 제거하는 무중단 전환을 했다. 교훈: exporter fan-out은 관찰성 도구 마이그레이션의 위험을 극적으로 낮춘다 — 한 번에 갈아타지 않고 병행 검증 후 전환할 수 있다.

## EKS 관찰성의 표준 스택 — ADOT + AMP + AMG

ADOT가 가장 빛나는 곳은 Kubernetes다. EKS에서 Prometheus 호환 메트릭을 수집하는 표준 스택이 **ADOT + AMP + AMG**다.

- **ADOT Collector**(DaemonSet): Pod의 `/metrics` 엔드포인트를 Prometheus 방식으로 scrape하고, trace를 OTLP로 받는다.
- **AMP**(Amazon Managed Prometheus): Collector가 `remote_write`로 메트릭을 보내는 관리형 Prometheus(Day 4).
- **AMG**(Amazon Managed Grafana): AMP를 PromQL로 쿼리해 대시보드(Day 4).

```bash
# EKS Add-on으로 ADOT Operator 설치
aws eks create-addon --cluster-name prod --addon-name adot
```

EKS Add-on은 ADOT Operator와 `OpenTelemetryCollector` CRD를 설치해, Collector를 쿠버네티스 네이티브 방식(선언적 YAML)으로 관리하게 한다. trace ID 호환도 ADOT가 처리한다 — X-Ray는 128비트+타임스탬프, OTel은 랜덤 128비트인데, ADOT가 양쪽 포맷을 변환해준다.

> 🎯 **시나리오**: "조직이 멀티 클라우드(AWS + 온프레미스)로 가며 관찰성을 표준화하려 한다. 추적 도구를 나중에 자유롭게 바꿀 수 있어야 하고, EKS의 Prometheus 메트릭과 trace를 함께 수집하며, 가능한 한 애플리케이션 코드 변경을 줄이고 싶다. 어떻게 설계하나?" — 답은 OpenTelemetry/ADOT 표준화다. ① 모든 서비스를 OTel API(또는 auto-instrumentation)로 계측해 벤더 중립으로 만든다 — 이후 백엔드는 exporter 설정만으로 바꾼다. ② EKS에 ADOT Collector를 DaemonSet/Add-on으로 배치해 Prometheus scrape(메트릭)와 OTLP(trace)를 함께 받는다. ③ exporter로 X-Ray(trace), AMP(메트릭), 필요시 온프레미스 Jaeger를 동시에 두어 멀티 백엔드. ④ 코드 변경 최소화는 auto-instrumentation(Lambda는 `AWS_LAMBDA_EXEC_WRAPPER`, Java는 `-javaagent`)으로 달성. 핵심은 "계측은 표준으로 한 번, 백엔드는 설정으로 자유롭게"다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **OpenTelemetry는 OpenTracing과 OpenCensus의 합병(2019)**으로 추적 도구 전쟁을 끝냈고, 핵심은 계측과 백엔드의 분리(의존성 역전)다. 둘째, **OTel은 logs·metrics·traces 세 신호를 OTLP 하나로 통합**해 상관관계를 자동화한다. 셋째, **Collector는 receiver-processor-exporter 파이프라인**(ETL/파이프-필터의 텔레메트리판)으로, 같은 데이터를 여러 백엔드로 fan-out하고 한곳에서 가공(필터·마스킹·tail 샘플링)한다. 넷째, **ADOT는 Lambda Layer·EKS Add-on 등으로 배포**되며 `AWS_LAMBDA_EXEC_WRAPPER` 같은 인터셉션으로 코드 변경 없이 자동 계측한다. 다섯째, **ADOT vs X-Ray SDK의 차이는 결합도** — 표준에 묶어 백엔드를 자유롭게 하느냐, X-Ray에 묶어 단순하게 하느냐이고, EKS 표준 스택은 ADOT + AMP + AMG다.

다음 글에서는 이 텔레메트리가 흘러 들어가는 **백엔드들 — OpenSearch(로그/검색), AMP(Prometheus 메트릭), AMG(Grafana 시각화)**를 깊이 본다. 역인덱스와 시계열 DB가 왜 다른 엔진인지, 어떤 워크로드에 무엇을 골라야 하는지를 판다.

---

## 📝 연습 문제

**문제 1.** ADOT(OpenTelemetry)의 가장 근본적인 가치는?

A) X-Ray보다 빠르다

B) 계측과 백엔드를 분리(의존성 역전)해 벤더 락인을 없앤다 — 코드는 OTel API로 한 번 계측하고 백엔드는 exporter 설정으로 자유롭게 바꾼다

C) IAM을 자동 관리한다

D) Lambda 전용 도구다

**정답: B**

해설: OpenTelemetry의 핵심 가치는 계측(OTel API)과 백엔드(exporter)의 분리다. 애플리케이션은 벤더 SDK가 아니라 표준 API에 의존하고, X-Ray로 보낼지 Datadog으로 보낼지는 설정으로 정한다(의존성 역전 원칙). 따라서 도구를 바꿔도 비즈니스 코드가 그대로여서 벤더 락인이 사라진다. SLF4J·JDBC가 로깅·DB 접근을 표준화하고 구현을 갈아끼우는 것과 같은 패턴이다. 속도(A)·IAM(C)·Lambda 전용(D)은 본질이 아니다.

---

**문제 2.** ADOT Collector의 receiver-processor-exporter 파이프라인에서, PII를 마스킹하고 헬스체크 trace를 버리는 가공은 어디서 하나?

A) receiver

B) processor (attributes로 PII 마스킹, filter로 헬스체크 제거)

C) exporter

D) Collector로는 불가능하다

**정답: B**

해설: Collector 파이프라인의 가공은 processor 단계에서 한다 — `attributes` processor로 PII 속성을 마스킹·삭제하고, `filter` processor로 불필요한(헬스체크) 데이터를 버리며, `tail_sampling`으로 결과 기반 샘플링을 한다. receiver(A)는 데이터를 받기만, exporter(C)는 백엔드로 내보내기만 한다. 이 가공을 백엔드와 무관하게 한곳(Collector)에서 하는 것이 파이프-필터 아키텍처의 조합성 이점이다.

---

**문제 3.** 온프레미스 Jaeger에서 AWS X-Ray로 추적을 마이그레이션하되, 기간 중 두 도구를 병행 검증하고 싶다. ADOT로 어떻게 하나?

A) 모든 서비스를 한 번에 X-Ray SDK로 재작성한다

B) Collector의 trace 파이프라인 exporter에 `awsxray`와 `otlp/jaeger`를 둘 다 넣어 같은 trace를 양쪽에 동시 전송(fan-out)하고, 검증 후 Jaeger exporter를 제거한다

C) X-Ray와 Jaeger를 둘 다 끄고 새로 만든다

D) Lambda Layer만 추가한다

**정답: B**

해설: Collector는 같은 데이터를 여러 exporter로 fan-out할 수 있다. trace 파이프라인에 `awsxray`와 `otlp/jaeger`를 함께 두면 동일한 trace가 양쪽에 동시 전송되어, 마이그레이션 기간 동안 두 도구를 병행하며 X-Ray를 검증할 수 있다. 검증 후 Jaeger exporter만 제거하면 무중단 전환이 된다. 한 번에 재작성(A)은 위험이 크고, exporter fan-out이 관찰성 도구 마이그레이션의 위험을 극적으로 낮춘다.

---

**문제 4.** Lambda에서 핸들러 코드를 전혀 바꾸지 않고 ADOT 자동 계측을 적용하는 핵심 설정은?

A) 코드에 `patch_all()` 추가

B) ADOT Lambda Layer 추가 + `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-instrument` 환경 변수 — wrapper가 런타임 부트스트랩을 가로채 OTel을 주입

C) X-Ray Daemon 사이드카 추가

D) ECS로 이전

**정답: B**

해설: ADOT Lambda Layer를 붙이고 `AWS_LAMBDA_EXEC_WRAPPER=/opt/otel-instrument`를 설정하면, Lambda가 런타임 시작 전에 이 wrapper 스크립트를 실행해 OTel auto-instrumentation을 주입한다. 핸들러 코드는 한 줄도 안 바뀐다. 이는 `-javaagent`·`LD_PRELOAD`처럼 본체를 수정하지 않고 경계에서 횡단 관심사를 주입하는 인터셉션 패턴(AOP의 인프라 구현)이다. `patch_all()`(A)은 코드 변경이 필요한 X-Ray SDK 방식이다.

---

**문제 5.** ADOT Collector를 tail-based 샘플링(에러 trace 100% 유지)에 쓰려면 agent 모드와 gateway 모드 중 무엇이 필요하며 그 이유는?

A) agent 모드 — 각 Pod 옆에 두면 된다

B) gateway 모드 — tail 샘플링은 한 trace의 모든 span이 한곳에 모여야 결과를 보고 판단할 수 있는데, agent 모드는 span이 여러 노드에 흩어진다

C) 둘 다 동일하다

D) Lambda Layer로만 가능하다

**정답: B**

해설: tail-based 샘플링은 trace가 완성된 뒤 결과(에러 여부·지연)를 보고 유지/폐기를 정하므로, 그 trace의 모든 span이 한 Collector에 모여 있어야 한다. agent 모드(노드별 사이드카/DaemonSet)는 한 trace의 span들이 여러 agent에 흩어져 결과 기반 판단이 불가능하다. 따라서 모든 텔레메트리를 모으는 gateway(중앙 집중) Collector가 필요하다. 실무 권장은 agent(1차 수집·가공) + gateway(tail 샘플링·라우팅)의 2계층이다.

---

**문제 6.** OpenTelemetry는 어떤 두 프로젝트의 합병으로 탄생했고, 각각 무엇에 집중했나?

A) Prometheus + Grafana

B) OpenTracing(API 표준화)과 OpenCensus(구현·자동 계측)의 2019년 합병 — API 추상화와 자동 계측 구현을 합쳤다

C) Zipkin + Jaeger

D) X-Ray + CloudWatch

**정답: B**

해설: OpenTelemetry는 추적 계측 API를 표준화하던 OpenTracing(CNCF)과 구글 주도로 자동 계측·에이전트를 제공하던 OpenCensus가 2019년 CNCF 주도로 합병해 탄생했다. OpenTracing의 API 추상화와 OpenCensus의 구현·auto-instrumentation을 합쳐, "API는 표준화, 자동 계측과 Collector는 구현으로 제공"하는 지금의 OTel이 됐다. 두 경쟁 표준의 분열을 합병으로 끝낸 사례다.

---

**문제 7.** "지금 AWS만 쓰고 단순한 추적이면 X-Ray SDK, 멀티 백엔드·벤더 중립이 필요하면 ADOT"라는 결정 기준의 근본 차이는?

A) 비용

B) 결합도 — X-Ray SDK는 코드를 X-Ray에 묶고, ADOT는 코드를 표준에 묶어 백엔드를 자유롭게 한다(대신 Collector·propagator 운영 부담)

C) 보안 수준

D) 지원 리전 수

**정답: B**

해설: 둘의 근본 차이는 결합도다. X-Ray SDK는 코드가 X-Ray에 묶여 단순하지만 백엔드를 바꾸기 어렵고, ADOT는 코드가 OTel 표준에 묶여 백엔드를 exporter 설정으로 자유롭게 바꿀 수 있다. 대신 ADOT는 Collector 운영·propagator 설정 등 다룰 구성요소가 더 많다. 따라서 "AWS만·단순 → X-Ray SDK, 멀티 백엔드·멀티 클라우드·벤더 중립 → ADOT"가 결정 기준이다. 비용·보안·리전은 핵심 판단 축이 아니다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, OpenTelemetry는 OpenTracing(API)과 OpenCensus(구현)의 2019년 합병으로 추적 도구 전쟁을 끝냈고, 핵심 가치는 계측과 백엔드의 분리(의존성 역전)로 벤더 락인을 없앤 것이다. 둘째, OTel은 logs·metrics·traces 세 신호를 OTLP 하나로 통합해 trace ID·resource 공유로 상관관계를 자동화한다. 셋째, Collector는 receiver-processor-exporter 파이프라인(ETL/파이프-필터의 텔레메트리판)으로, 같은 데이터를 여러 백엔드로 fan-out하고 PII 마스킹·필터·tail 샘플링을 한곳에서 하며, tail 샘플링은 gateway 모드가 필요하다. 넷째, ADOT는 Lambda Layer·EKS Add-on 등으로 배포되고 `AWS_LAMBDA_EXEC_WRAPPER` 같은 인터셉션(AOP의 인프라 구현)으로 코드 변경 없이 자동 계측한다. 다섯째, ADOT vs X-Ray SDK의 차이는 결합도이며(표준 vs X-Ray 종속), EKS 관찰성 표준 스택은 ADOT + AMP + AMG다.
