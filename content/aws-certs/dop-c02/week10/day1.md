# Day 1 - CloudWatch Metrics: 시계열·차원·알람 평가 모델의 깊은 이야기

서버 한 대의 상태를 보는 일은 쉽다. `top`을 띄우면 CPU가 보이고 `free`로 메모리가 보인다. 그런데 그 한 대가 수백 대가 되고, Lambda 함수 수천 개가 초당 수만 번 돌고, ECS Task가 오토스케일로 떴다 사라지는 순간 "상태를 본다"는 행위 자체가 다른 문제가 된다. 누가 이 수치들을 모으고, 어떻게 시간축에 정렬하고, 어떤 단위로 집계하고, 무엇이 "이상"인지를 어떻게 판단할 것인가. CloudWatch Metrics는 AWS 위에서 도는 거의 모든 것의 수치형 시계열(time series)을 한곳에 모으는 토대이고, 그 위에 알람·오토스케일링·대시보드·이상 탐지가 전부 얹혀 있다.

오늘은 이 토대를 깊이 판다. 단순히 "PutMetricData로 메트릭을 보낸다"가 아니라, 메트릭이 내부적으로 어떤 자료구조로 저장되는지(namespace·name·dimensions가 왜 합쳐서 하나의 식별자인지), EMF가 왜 PutMetricData보다 비용·구조 양쪽에서 우월한지, 알람의 `evaluation-periods`/`datapoints-to-alarm`/`treat-missing-data`라는 세 손잡이가 어떤 신뢰성 공학 원리를 담고 있는지, Anomaly Detection이 어떤 통계 모델을 쓰는지를 파고든다. DOP 시험에서 CloudWatch는 거의 모든 도메인(모니터링·인시던트·배포 검증)에 스며들어 나오는 기반 서비스라, "알람이 왜 안 울렸나", "비용을 어떻게 줄이나", "임계값을 수동으로 못 정하는 지표는 어떻게 하나" 같은 시나리오가 매 회 출제된다.

## 메트릭의 정체 — 무엇이 "하나의 메트릭"을 정의하는가

CloudWatch에서 가장 자주 오해받는 개념이 "메트릭의 정체성(identity)"이다. 많은 사람이 메트릭 이름(`CPUUtilization`)이 곧 메트릭이라고 생각하지만, 실제로 CloudWatch가 하나의 시계열을 식별하는 키는 **namespace + metric name + dimensions의 전체 조합**이다. 이 세 가지 중 하나라도 다르면 완전히 별개의 시계열이다.

```bash
aws cloudwatch put-metric-data \
  --namespace MyApp/Orders \
  --metric-name OrderCount \
  --value 5 \
  --dimensions Service=checkout,Environment=prod \
  --unit Count
```

이 한 줄은 `MyApp/Orders | OrderCount | {Service=checkout, Environment=prod}`라는 키를 가진 시계열에 데이터포인트 하나를 추가한다. 만약 `Environment=staging`으로 바꿔 보내면 그건 다른 시계열이다. 이 설계가 중요한 이유는 **차원의 카디널리티(고유 조합 수)가 곧 메트릭 개수이고, 메트릭 개수가 곧 비용**이기 때문이다. `Service`(10종) × `Environment`(3종)이면 30개 시계열이지만, 여기에 `UserId`(100만 명)를 차원으로 넣는 순간 시계열이 수백만 개로 폭발한다. 이것이 뒤에 나올 high-cardinality 함정의 뿌리다.

> 💡 **관련 이론**: CloudWatch의 이 모델은 시계열 데이터베이스(TSDB)의 표준 구조 그대로다. Prometheus는 동일한 개념을 `metric_name{label1="v1", label2="v2"}`로 표현하고, 각 고유 레이블 조합을 하나의 "시리즈(series)"라 부른다. InfluxDB는 measurement + tag set, OpenTSDB는 metric + tags로 같은 일을 한다. 핵심 원리는 **dimension(label/tag)이 인덱싱의 단위이자 카디널리티 폭발의 원천**이라는 점이다. TSDB 운영의 절반은 "어떤 차원을 인덱스에 넣고 어떤 것을 넣지 않을지"의 카디널리티 관리다. CloudWatch가 차원당 비용을 매기는 것도 같은 제약에서 나온다.

> 🔍 **더 깊이**: CloudWatch 메트릭에는 **publish 시점에 차원을 정하면 나중에 임의로 집계 차원을 추가할 수 없다**는 제약이 있다. `{Service, Environment}`로 보낸 데이터를 나중에 "Service 무시하고 Environment별로만" 보려면, publish 당시 그 집계 조합(`{Environment}`만 있는 시계열)도 함께 보냈어야 한다. 이것이 EMF의 `Dimensions: [["Service","Environment"], ["Environment"], []]`처럼 차원 조합을 배열로 여러 개 동시에 게시하는 패턴이 존재하는 이유다. PutMetricData로는 한 호출에 차원 조합 하나만 보내므로, 같은 데이터를 여러 집계 관점으로 보려면 여러 번 호출해야 한다 — 이게 EMF가 구조적으로 우월한 지점 중 하나다.

## 사용자 정의 메트릭 — 세 가지 경로와 그 비용 구조

AWS 서비스들은 자동으로 `AWS/EC2`, `AWS/Lambda` 같은 namespace에 메트릭을 쏟아낸다. 하지만 "주문 수", "결제 실패율" 같은 비즈니스 지표는 직접 게시해야 한다. 게시 경로가 세 가지인데, 이들의 차이는 단순한 API 선택이 아니라 **비용 모델과 데이터 결합 방식**의 차이다.

**첫째, PutMetricData API.** 가장 직관적이다. 메트릭 한 묶음을 보낼 때마다 API를 한 번 호출한다. 문제는 비용이다. PutMetricData는 호출 횟수와 커스텀 메트릭 수 양쪽으로 과금되고, 초당 수천 번 호출되는 Lambda에서 매 호출마다 이걸 부르면 API 비용과 지연(동기 호출이면 응답을 기다린다)이 누적된다.

**둘째, Embedded Metric Format(EMF).** 여기서 발상이 전환된다. 메트릭을 별도 API로 보내지 않고, **이미 출력하는 로그 안에 특수한 JSON 구조로 끼워 넣는다.** Lambda나 ECS가 stdout에 JSON을 찍으면 그게 CloudWatch Logs로 가는데, 그 JSON에 `_aws` 키가 있으면 CloudWatch가 로그를 적재하면서 **동시에 메트릭을 자동 추출**한다.

```json
{
  "_aws": {
    "Timestamp": 1716368400000,
    "CloudWatchMetrics": [{
      "Namespace": "MyApp/Orders",
      "Dimensions": [["Service"]],
      "Metrics": [{"Name": "OrderCount", "Unit": "Count"}]
    }]
  },
  "Service": "checkout",
  "OrderCount": 5,
  "OrderId": "ord-abc-123"
}
```

추가 메트릭 API 호출이 0이다. 코드는 그냥 로그를 찍을 뿐이고, 메트릭은 부수적으로 따라 나온다. 게다가 `OrderId` 같은 고카디널리티 식별자는 메트릭이 아니라 **로그 필드**로 남아 Logs Insights에서 검색된다. 메트릭(저카디널리티 집계)과 로그(고카디널리티 상세)를 한 번의 출력으로 깔끔히 분리하는 것 — 이게 EMF의 본질이다.

**셋째, CloudWatch Agent.** EC2·온프레미스의 시스템 메트릭(메모리, 디스크 — 이 둘은 하이퍼바이저 밖이라 EC2 기본 메트릭에 없다)과 로그를 수집한다. StatsD/collectd 프로토콜과 호환되어 기존 애플리케이션 계측을 그대로 받는다.

> 💡 **관련 이론**: EMF의 "로그에 메트릭을 임베드한다"는 발상은 구조화 로깅(structured logging)과 메트릭의 수렴이다. 전통적으로 로그(텍스트, 고카디널리티, 사후 검색)와 메트릭(수치, 저카디널리티, 실시간 집계)은 별개 파이프라인이었다. EMF는 이 둘을 한 이벤트로 통합한다. 이는 옵저버빌리티 업계의 "wide events" 또는 "canonical log lines"(Stripe가 대중화) 철학과 같다 — 요청 하나당 모든 컨텍스트를 담은 넓은 이벤트 하나를 찍고, 거기서 메트릭·로그·추적을 파생시킨다. Honeycomb의 high-cardinality 이벤트 모델, OpenTelemetry의 통합 신호도 같은 방향이다.

> 📚 **사례**: 한 핀테크 스타트업이 초당 수천 건 처리하는 결제 Lambda에서 거래마다 PutMetricData를 5개 차원으로 동기 호출했다. CloudWatch API의 throttling(계정·리전당 TPS 한도)에 걸려 일부 호출이 실패했고, 더 나쁘게는 동기 호출의 지연이 Lambda 실행 시간에 더해져 결제 응답이 느려졌다. EMF로 전환하자 메트릭 API 호출이 0이 되면서 throttling이 사라지고, Lambda는 그냥 로그를 찍는 것이라 지연도 제거됐다. "PutMetricData를 핫 패스에서 동기 호출하지 마라"는 EMF가 푸는 전형적 안티패턴이다.

## High-Resolution Metric — 1초 해상도가 푸는 문제와 그 대가

표준 메트릭은 60초 해상도다. 1분에 데이터포인트 하나. 대부분의 운영에 충분하지만, 트래픽이 초 단위로 폭증하는 워크로드에서는 60초 평균이 진실을 가린다. 30초 동안 부하가 두 배로 튀었다 가라앉아도 60초 평균에서는 살짝 오른 정도로만 보인다. High-Resolution Metric은 **1초 해상도**를 제공해 이 미세한 스파이크를 포착한다.

```bash
aws cloudwatch put-metric-data \
  --namespace MyApp/Traffic --metric-name RequestRate \
  --value 4500 --storage-resolution 1
```

`--storage-resolution 1`이 1초 해상도를 켠다(기본은 60). 대가는 비용과 보존이다. 데이터포인트가 60배 많으니 저장 비용도 그만큼 들고, 1초 데이터는 3시간만 보존된다(이후 자동으로 더 거친 해상도로 롤업). 알람도 표준은 최소 60초 평가지만, high-resolution 메트릭은 10초·30초 평가가 가능해 더 빠르게 반응한다.

> 🔍 **더 깊이**: CloudWatch는 메트릭을 **시간이 지나면서 점진적으로 더 거친 해상도로 롤업(rollup)**한다. 1초 데이터는 3시간, 60초 데이터는 15일, 5분 데이터는 63일, 1시간 데이터는 15개월 보존된다. 즉 어제의 1초 스파이크는 오늘 보면 1분 평균으로만 남아 있다. 이는 시계열 저장의 보편적 기법인 **다운샘플링/롤업**이다(RRDtool의 RRA, Prometheus의 recording rule + 장기 저장소, Graphite의 retention schema). 함의는 분명하다: 1초 해상도의 정밀 분석은 사건 발생 후 3시간 안에 해야 한다. 사후 포렌식을 위해 고해상도 원본이 필요하면 Metric Streams로 외부에 따로 보존해야 한다.

## 알람 평가 모델 — 세 손잡이에 담긴 신뢰성 공학

알람은 CloudWatch에서 가장 자주 잘못 설정되는 부분이다. "임계값만 넘으면 울린다"는 단순한 모델이 아니라, **얼마나 자주 보고(period), 몇 번을 보고(evaluation-periods), 그중 몇 번이 위반이어야 울리고(datapoints-to-alarm), 데이터가 없으면 어떻게 취급하나(treat-missing-data)**라는 네 개의 손잡이로 동작한다.

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name High5xxRate \
  --metric-name HTTPCode_Target_5XX_Count \
  --namespace AWS/ApplicationELB \
  --dimensions Name=LoadBalancer,Value=app/MyApp/abc \
  --statistic Sum --period 60 \
  --evaluation-periods 3 \
  --datapoints-to-alarm 2 \
  --threshold 10 \
  --comparison-operator GreaterThanThreshold \
  --treat-missing-data notBreaching \
  --alarm-actions arn:aws:sns:...:AlertTopic
```

평가 규칙은 **"M out of N"**이다. 위 설정은 "최근 3개 평가 기간(`evaluation-periods 3`) 중 2개(`datapoints-to-alarm 2`)가 임계값(10)을 초과하면 ALARM"이다. 왜 이렇게 복잡한가? **단발성 스파이크로 알람이 울리는 노이즈를 막기 위해서**다. `datapoints-to-alarm`을 1로 두면 한 번만 튀어도 울려 알람 피로(alarm fatigue)가 생긴다. 3 중 2로 두면 "지속적 이상"만 잡는다. 빠르게 반응해야 하는 지표는 N을 작게, 노이즈를 줄여야 하는 지표는 M/N 비율을 높인다. 이게 민감도(sensitivity)와 특이도(specificity)의 트레이드오프를 다이얼로 조절하는 것이다.

`treat-missing-data`는 더 미묘하다. 데이터포인트가 아예 없는 기간을 어떻게 볼 것인가:

| 값 | 의미 | 쓰임 |
|------|------|------|
| `notBreaching` (기본) | 데이터 없음 = 정상 | 가끔만 발생하는 sparse 지표 |
| `breaching` | 데이터 없음 = 위반 | "하트비트가 끊기면 곧 장애" |
| `missing` | 평가에서 제외 | 데이터 유무로 판단 보류 |
| `ignore` | 현재 상태 유지 | 상태 플래핑 방지 |

> 💡 **관련 이론**: 알람의 "M out of N" + missing data 처리는 신호 처리의 **디바운싱(debouncing)/히스테리시스(hysteresis)** 와 같은 발상이다. 전기 스위치가 접점에서 미세하게 튀는(chatter) 신호를 그대로 받으면 on/off가 수십 번 반복되므로, 일정 시간 안정된 상태만 인정하는 디바운스를 건다. 알람의 datapoints-to-alarm은 시간축 디바운스, comparison-operator + 별도의 OK 임계는 히스테리시스다. 통계적으로는 거짓 양성(false positive)과 거짓 음성(false negative)의 균형 — 너무 민감하면 노이즈(1종 오류), 너무 둔하면 놓침(2종 오류). 좋은 알람 설계는 이 둘 사이에서 SLO에 맞는 지점을 고르는 일이다.

> ⚠️ **함정**: sparse 메트릭(예: 결제 실패 — 평소엔 0이라 데이터포인트 자체가 없음)에 `treat-missing-data: breaching`을 걸면 알람이 영구 ALARM에 갇힌다. 실패가 없어 데이터가 없는데, 데이터 없음을 위반으로 해석하기 때문이다. 반대로 하트비트(살아 있으면 매 분 1을 보내는) 지표에 `notBreaching`을 걸면, 인스턴스가 죽어 하트비트가 끊겨도 "데이터 없음 = 정상"으로 봐서 장애를 놓친다. **지표의 의미(데이터 없음이 좋은 신호냐 나쁜 신호냐)에 따라 정반대를 골라야 한다.** 이 두 가지를 거꾸로 설정하는 것이 알람 오작동의 가장 흔한 원인이다.

## Composite Alarm — 알람의 부울 대수

알람이 많아지면 새로운 문제가 생긴다. 하나의 인시던트(예: "체크아웃 서비스 장애")가 여러 알람(5xx 증가, 지연 증가, 처리량 감소)을 동시에 울려 온콜 담당자에게 세 통의 페이지가 날아간다. Composite Alarm은 자식 알람들을 **부울 식(AND/OR/NOT)**으로 결합해 하나의 상위 알람으로 묶는다.

```bash
aws cloudwatch put-composite-alarm \
  --alarm-name AppDegraded \
  --alarm-rule "ALARM('High5xx') AND (ALARM('HighLatency') OR ALARM('LowThroughput'))" \
  --alarm-actions arn:aws:sns:...:AppOncall
```

이제 "5xx가 높으면서 (지연이 높거나 처리량이 낮을) 때"만 사람을 깨운다. 개별 알람은 통보 액션 없이 신호로만 두고, Composite만 페이지를 보낸다. 알람 노이즈가 극적으로 줄고, "무엇이 진짜 인시던트인가"를 식으로 정의할 수 있다.

> 🔍 **더 깊이**: Composite Alarm은 알람 상태에 대한 **불 대수(Boolean algebra)** 를 제공해 "징후의 상관(correlation)"을 표현한다. 단일 메트릭은 "증상"이지만, 실제 인시던트는 여러 증상의 특정 패턴이다. 이는 모니터링 성숙도에서 **증상 기반 알림(symptom-based alerting)** 으로 가는 길의 일부다 — Google SRE 책이 강조하는 "원인이 아니라 사용자가 느끼는 증상에 알람을 걸어라". Composite로 "5xx AND 지연증가 = 사용자가 실제로 영향받는 중"을 정의하면, 내부 부품 하나가 깜빡였다고 깨우는 원인 기반 알람의 노이즈를 걷어낸다. AND로 거짓 양성을 줄이고, OR로 여러 실패 경로를 한 인시던트로 포괄한다.

## Anomaly Detection과 Metric Math — 임계값을 학습하고 파생시키다

어떤 지표는 정적 임계값을 정할 수 없다. 주문 수는 평일 낮에 높고 새벽엔 낮으며, 주말 패턴이 또 다르다. "주문 수 < 100이면 알람"을 걸면 새벽마다 거짓 알람이 울린다. **Anomaly Detection**은 머신러닝으로 이 시간대별·요일별 정상 패턴을 학습해, "이 시각 기준 정상 범위"를 동적으로 그린다.

```bash
aws cloudwatch put-anomaly-detector \
  --namespace AWS/ApplicationELB --metric-name TargetResponseTime \
  --dimensions Name=LoadBalancer,Value=app/MyApp/abc --stat p99
```

알람은 "값이 학습된 정상 밴드를 벗어나면" 울리도록 `LessThanLowerOrGreaterThanUpperThreshold` 연산자로 건다. 임계값을 사람이 정하는 게 아니라 모델이 그린 밴드를 쓴다.

**Metric Math**는 여러 메트릭을 수식으로 결합해 파생 지표를 만든다. 가장 흔한 예가 비율이다.

```
e1: (errors / invocations) * 100   # 에러율(%)
```

`Errors`와 `Invocations`라는 원천 메트릭은 절대 수치라 트래픽에 따라 변하지만, 에러율은 트래픽과 무관하게 의미가 일정하다. "에러율 > 1%" 같은 알람은 Metric Math 없이는 못 만든다.

> 💡 **관련 이론**: CloudWatch Anomaly Detection은 내부적으로 시계열의 **계절성(seasonality)을 분해**하는 모델을 쓴다. 시계열을 추세(trend) + 계절(seasonal, 일/주 주기) + 잔차(residual)로 나누는 고전적 분해(STL decomposition, Holt-Winters 지수평활)와 같은 계열이다. 모델이 "이 시각·이 요일의 기대값과 정상 변동폭"을 학습해 밴드를 그리고, 관측값이 밴드 밖이면 이상으로 본다. 통계적 공정 관리(SPC)의 관리도(control chart)에서 ±3σ 관리 한계를 벗어나면 이상으로 보는 것과 같은 원리인데, σ가 고정이 아니라 시간대별로 학습된다는 점이 다르다. 임계값을 사람이 못 정하는 "계절성 있는 비즈니스 지표"가 정확히 이 도구의 적용 대상이다.

## 메트릭을 외부로 — Metric Streams와 Cross-Account

CloudWatch에 갇힌 메트릭을 외부로 빼는 두 경로가 있다. **Metric Streams**는 메트릭을 Kinesis Data Firehose를 통해 거의 실시간으로 S3·Datadog·Splunk·New Relic 등으로 흘려보낸다. PutMetricData를 폴링으로 긁어오는 `GetMetricData` 방식보다 지연이 낮고, 데이터포인트를 놓치지 않으며, 대규모에서 API 한도에 걸리지 않는다. 멀티클라우드 관측 도구에 AWS 메트릭을 통합하는 표준 경로다.

**Cross-Account Observability**(2023+)는 여러 계정의 메트릭·로그·추적을 하나의 모니터링 계정에서 통합 조회한다. Source 계정이 Sink ARN을 신뢰하면, 모니터링 계정이 단방향으로 그 데이터를 본다(Source는 모니터링 계정 데이터를 못 봄). 멀티계정 조직에서 중앙 SRE 팀이 전체를 한 화면에서 보는 구조다.

> 🎯 **시나리오**: "조직이 Datadog을 표준 관측 플랫폼으로 쓴다. AWS 메트릭을 Datadog에 통합하되, 수십만 메트릭을 폴링하다 CloudWatch API 한도에 걸리는 현재 방식을 개선하고 싶다." — 답은 Metric Streams다. 기존 통합은 보통 Datadog이 GetMetricData/ListMetrics를 주기적으로 폴링하는데, 메트릭 수가 많으면 API throttling과 지연이 누적된다. Metric Streams는 CloudWatch가 메트릭을 Firehose로 푸시하므로 폴링이 사라지고, 지연이 분 단위에서 수 초로 줄며, API 한도 문제가 근본적으로 없어진다. "폴링 → 푸시 스트리밍"으로의 전환이 핵심이다.

## 정리하며

오늘 본 그림은 다섯 가지다. 첫째, **메트릭의 정체성은 namespace+name+dimensions 전체 조합**이고, 차원 카디널리티가 곧 메트릭 수이자 비용이다. 둘째, **게시 경로 셋(PutMetricData·EMF·Agent) 중 Lambda/ECS에서는 EMF가 구조적으로 우월**하다 — API 호출 0, 로그/메트릭 통합, 다중 차원 조합 동시 게시. 셋째, **알람은 단순 임계값이 아니라 "M out of N" + missing data 처리**라는 디바운싱 모델이고, 지표의 의미에 따라 missing 처리를 정반대로 골라야 한다. 넷째, **Composite Alarm은 알람의 부울 대수**로 증상 상관을 표현해 노이즈를 줄인다. 다섯째, **Anomaly Detection은 계절성 분해로 임계값을 학습**하고, Metric Math는 비율 같은 파생 지표를 만들며, Metric Streams는 폴링을 푸시로 바꿔 외부 통합을 푼다.

다음 글에서는 CloudWatch Logs를 깊이 본다. 로그가 어떻게 그룹·스트림으로 조직되는지, Subscription Filter가 어떻게 로그를 실시간으로 라우팅하는지, Logs Insights의 쿼리 엔진이 무엇이고 왜 로그가 이렇게 비싼지 — 로그 파이프라인의 내부로 들어간다.

---

## 📝 연습 문제

**문제 1.** Lambda가 초당 수천 번 호출되는 핫 패스에서 사용자 정의 메트릭을 게시한다. PutMetricData를 매 호출마다 동기로 부르자 API throttling과 응답 지연이 발생했다. 가장 적절한 개선은?

A) 메트릭 차원 수를 줄인다
B) EMF로 전환 — 로그에 메트릭을 임베드해 메트릭 API 호출을 0으로 만든다
C) High-Resolution Metric으로 전환한다
D) PutMetricData 호출을 비동기 스레드로 옮긴다

**정답: B**

해설: PutMetricData를 핫 패스에서 동기 호출하면 API throttling(계정·리전 TPS 한도)과 호출 지연이 누적된다. EMF는 메트릭을 별도 API로 보내지 않고 이미 출력하는 로그 JSON에 `_aws` 구조로 끼워 넣어 CloudWatch가 적재 시 자동 추출하므로, 메트릭 API 호출이 0이 되어 throttling과 지연이 동시에 사라진다. 차원 축소(A)는 부분 완화일 뿐 근본 해결이 아니고, High-Resolution(C)은 비용을 오히려 늘리며, 비동기 스레드(D)는 throttling 자체를 없애지 못한다.

---

**문제 2.** 같은 데이터를 `{Service, Environment}`로도, `{Environment}`만으로도, 전체 합산으로도 보고 싶다. PutMetricData로는 번거롭다. 가장 효율적인 방법은?

A) 세 번 PutMetricData 호출
B) EMF의 `Dimensions: [["Service","Environment"], ["Environment"], []]`로 한 번에 다중 차원 조합 게시
C) Metric Math로 사후 집계
D) Anomaly Detection 활성화

**정답: B**

해설: CloudWatch는 publish 시점에 정한 차원 조합으로만 집계를 제공하므로, 여러 집계 관점이 필요하면 그 조합들을 모두 게시해야 한다. EMF는 `Dimensions`를 배열의 배열로 받아 한 번의 로그 출력으로 여러 차원 조합(둘 다 / Environment만 / 전체 합산 `[]`)을 동시에 게시한다. PutMetricData(A)는 조합마다 별도 호출이 필요해 비효율적이고, Metric Math(C)는 이미 publish된 시계열을 결합할 뿐 없는 집계 차원을 사후 생성하지 못한다.

---

**문제 3.** ALB 5xx 알람이 단발성 스파이크에도 울려 온콜 피로가 심하다. 지속적 이상만 잡되 일시적 튐은 무시하려면?

A) `datapoints-to-alarm`을 1로, `evaluation-periods`를 1로
B) `evaluation-periods 3`, `datapoints-to-alarm 2`로 "3 중 2" 평가
C) period를 1초로 줄인다
D) threshold를 0으로 낮춘다

**정답: B**

해설: "M out of N"(여기서 3 중 2)은 시간축 디바운싱이다. 최근 3개 평가 기간 중 2개가 위반이어야 ALARM이 되므로 단발성 스파이크는 걸러지고 지속적 이상만 잡힌다. A는 한 번만 튀어도 울려 노이즈가 최대가 되고, period 단축(C)은 오히려 더 민감해지며, threshold 0(D)은 상시 ALARM을 만든다.

---

**문제 4.** 결제 실패 메트릭은 평소 0이라 데이터포인트 자체가 없다(sparse). 실패가 임계 이상일 때만 울리려면 `treat-missing-data`를?

A) `breaching`
B) `notBreaching` — 데이터 없음을 정상으로 간주
C) `missing`만으로 충분
D) high-resolution으로 전환

**정답: B**

해설: sparse 메트릭은 평소 데이터가 없는 것이 정상 상태다. `notBreaching`으로 두어야 데이터 없음을 정상으로 보고, 실제 실패가 임계를 넘을 때만 ALARM이 된다. `breaching`(A)을 걸면 실패가 없어 데이터가 없는데도 영구 ALARM에 갇힌다. 반대로 하트비트처럼 "데이터 없음 = 장애"인 지표에는 `breaching`을 써야 하므로, 지표 의미에 따라 정반대를 고르는 것이 핵심이다.

---

**문제 5.** 하나의 인시던트("체크아웃 장애")가 5xx·지연·처리량 세 알람을 동시에 울려 온콜이 세 통의 페이지를 받는다. 노이즈를 줄이면서 "진짜 인시던트"를 정의하려면?

A) 세 알람을 모두 삭제하고 5xx만 남긴다
B) Composite Alarm으로 `ALARM('High5xx') AND (ALARM('HighLatency') OR ALARM('LowThroughput'))`을 정의하고 통보는 Composite에만 건다
C) 세 알람의 threshold를 모두 높인다
D) SNS 구독을 줄인다

**정답: B**

해설: Composite Alarm은 자식 알람을 부울 식으로 결합해 "증상의 특정 조합 = 인시던트"를 정의한다. 개별 알람은 통보 없이 신호로 두고 Composite만 페이지를 보내면, 한 인시던트당 한 번만 깨우면서도 "5xx면서 (지연 또는 처리량 이상)"이라는 정밀한 조건으로 거짓 양성을 줄인다. 알람 삭제(A)는 가시성을 잃고, threshold 상향(C)은 실제 이상도 놓치며, 구독 축소(D)는 근본 문제를 안 푼다.

---

**문제 6.** 주문 수가 평일 낮엔 높고 새벽엔 낮으며 주말 패턴이 또 다르다. 정적 임계값으로는 새벽마다 거짓 알람이 난다. 가장 적절한 도구는?

A) High-Resolution Metric
B) Anomaly Detection — 시간대·요일별 정상 밴드를 학습해 이탈만 탐지
C) Composite Alarm
D) Metric Filter

**정답: B**

해설: 계절성(일·주 주기)이 있는 지표는 단일 정적 임계값으로 다룰 수 없다. Anomaly Detection은 시계열을 추세·계절·잔차로 분해해 "이 시각·이 요일의 정상 범위"를 동적으로 학습하고, 관측값이 그 밴드를 벗어날 때만 알람한다. High-Resolution(A)은 해상도 문제일 뿐 계절성을 다루지 못하고, Composite(C)는 알람 결합, Metric Filter(D)는 로그에서 메트릭을 추출하는 별개 기능이다.

---

**문제 7.** 절대 수치인 `Errors`와 `Invocations`로는 "에러율 1% 초과" 알람을 만들 수 없다. 트래픽과 무관한 비율 알람을 만들려면?

A) Errors에만 threshold를 건다
B) Metric Math로 `(errors / invocations) * 100`을 계산하고 그 결과에 알람을 건다
C) Anomaly Detection
D) Composite Alarm

**정답: B**

해설: Metric Math는 여러 메트릭을 수식으로 결합해 파생 지표를 만든다. 에러율 = (errors / invocations) × 100은 트래픽 규모와 무관하게 의미가 일정하므로, 이 수식 결과에 알람을 걸면 트래픽이 늘어도 비율 기준이 유지된다. Errors 절대값(A)에 거는 임계는 트래픽이 늘면 같이 늘어 의미가 흔들리고, Anomaly Detection(C)·Composite(D)는 비율 계산 자체를 제공하지 않는다.

---

## 📌 오늘의 요약

오늘 본 핵심은 다섯 가지다. 첫째, 메트릭의 정체성은 namespace+name+dimensions 전체 조합이며 차원 카디널리티가 곧 메트릭 수이자 비용이다(Prometheus/InfluxDB의 시리즈 개념과 동일). 둘째, 게시 경로 중 Lambda/ECS에서는 EMF가 구조적으로 우월하다 — 메트릭 API 호출 0, 로그/메트릭 통합, 다중 차원 조합 동시 게시, 고카디널리티 식별자는 로그 필드로 분리. 셋째, 알람은 "M out of N" + treat-missing-data라는 디바운싱 모델이고, sparse 지표는 notBreaching, 하트비트는 breaching처럼 지표 의미에 따라 missing 처리를 정반대로 골라야 한다. 넷째, Composite Alarm은 알람의 부울 대수로 증상 상관(symptom-based)을 표현해 노이즈를 줄인다. 다섯째, Anomaly Detection은 계절성 분해로 임계값을 학습하고, Metric Math는 비율 같은 파생 지표를, Metric Streams는 폴링→푸시 전환으로 외부 통합을 해결한다.
