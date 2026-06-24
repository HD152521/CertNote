# Day 4 - X-Ray·Trusted Advisor·Health Dashboard: 한 요청이 여러 서비스를 지날 때 누가 느린지 어떻게 아는가

마이크로서비스로 시스템을 쪼개면 얻는 게 있고 잃는 게 있다. 얻는 건 독립 배포와 확장이고, 잃는 건 "전체 그림"이다. 모놀리식 시절엔 느린 요청이 있으면 스택 트레이스 하나로 어느 함수가 병목인지 보였다. 그런데 요청 하나가 API Gateway → Lambda → DynamoDB → 외부 결제 API → SNS → 또 다른 Lambda를 지나가면, 각 서비스의 로그는 자기가 본 조각만 안다. Lambda 로그는 "나는 200ms 걸렸다"고 하고, DynamoDB 메트릭은 "나는 5ms였다"고 하는데, 사용자는 3초를 기다렸다. 그 나머지 2.8초가 어디서 샜는지는 어느 한 서비스도 모른다. 이 "조각난 진실을 하나로 꿰는" 문제가 분산 트레이싱(distributed tracing)이 풀려는 것이고, AWS에서 그 도구가 **X-Ray**다.

이 글은 X-Ray가 어떻게 한 요청의 전체 여정을 하나의 트레이스로 재구성하는지, 왜 모든 요청을 추적하지 않고 샘플링하는지, 그리고 X-Ray와 짝을 이루는 운영 도구인 **Trusted Advisor**(모범 사례 권고)·**Health Dashboard**(AWS 측 사고)·**Compute Optimizer**(ML 기반 right-sizing)가 각각 어떤 질문에 답하는지를 따라간다. SAA 시험은 이 네 도구를 "내 코드의 지연 / 환경의 권고 / AWS의 사고 / 자원의 크기"라는 서로 다른 질문에 매핑하는 능력을 반복해서 묻는다.

## X-Ray는 어떻게 조각난 로그를 하나의 여정으로 꿰는가

분산 트레이싱의 핵심 발상은 의외로 단순하다. 요청이 시스템에 들어오는 첫 지점에서 고유한 **Trace ID**를 발급하고, 그 ID를 요청이 거쳐가는 모든 서비스에 따라다니게 하는 것이다. 각 서비스는 자기가 처리한 구간을 "이 Trace ID의 한 조각"으로 기록한다. 나중에 같은 Trace ID를 가진 조각들을 시간순으로 모으면, 흩어진 로그가 하나의 연속된 여정으로 재구성된다.

X-Ray의 용어로 이 조각이 **Segment**다. 한 서비스(예: Lambda 함수)가 요청을 받아 응답을 돌려주기까지의 전체 작업이 하나의 Segment이고, 그 안에서 외부 호출(DynamoDB 쿼리, HTTP 요청)은 **Subsegment**로 더 잘게 쪼개진다. 그래서 하나의 트레이스는 `Segment(API GW) → Segment(Lambda) → Subsegment(DynamoDB) + Subsegment(외부 API)` 같은 트리 구조가 된다. 각 노드에는 시작 시각·소요 시간·에러 여부가 붙어 있어서, "Lambda는 200ms인데 그 안의 외부 API Subsegment가 2.8초"라는 게 한눈에 보인다.

> 💡 **관련 이론**: 이 Trace ID 전파(context propagation) 방식은 X-Ray가 발명한 게 아니라 Google이 2010년 발표한 논문 **Dapper**에서 정립된 모델이다. Dapper는 "trace는 span의 트리이고, 각 span은 부모 span ID를 들고 다닌다"는 구조를 제시했고, 이후 Zipkin(Twitter), Jaeger(Uber)가 이를 오픈소스로 구현했다. X-Ray의 Segment/Subsegment는 Dapper의 span에 해당한다. 즉 X-Ray는 분산 트레이싱의 표준 모델을 AWS 관리형으로 구현한 것이고, 그래서 OpenTelemetry 같은 표준 trace context와 상호 변환이 가능하다.

> 🔍 **더 깊이**: Trace ID는 어떻게 서비스 경계를 넘어 전파될까. HTTP 호출에서는 **`X-Amzn-Trace-Id`** 헤더에 trace context가 실려서 다음 서비스로 넘어간다. 이 헤더에는 `Root=`(트레이스 ID), `Parent=`(부모 segment ID), `Sampled=`(이 요청을 추적할지 여부) 필드가 들어 있다. 즉 "이 요청을 샘플링할 것인가"라는 결정이 첫 진입점에서 내려지면, 그 결정이 헤더를 타고 모든 다운스트림에 전파돼 일관되게 적용된다. 한 서비스만 추적하고 다음 서비스는 안 하는 불일치가 생기지 않는 이유다. W3C가 표준화한 `traceparent` 헤더(Trace Context, W3C Recommendation)도 같은 발상이며, ADOT는 이 둘을 모두 다룬다.

X-Ray의 가장 강력한 출력물은 **Service Map**이다. 수집된 트레이스들을 종합해 "서비스 간 호출 그래프"를 자동으로 그려주는데, 노드는 서비스, 엣지는 호출 관계이고, 각 노드/엣지에 평균 지연·에러율·요청량이 색으로 표시된다. 빨갛게 물든 노드가 병목이거나 에러 발원지다. 이건 사람이 아키텍처 다이어그램을 손으로 그리는 게 아니라, 실제 트래픽이 만들어낸 "관측된 아키텍처"라는 점이 중요하다. 코드에 적힌 의도가 아니라 런타임에 실제로 일어난 호출이 그려진다.

> ⚠️ **함정**: "Lambda 함수가 느린데, 함수 자체 코드 때문인지 그 함수가 호출하는 다운스트림(DynamoDB·외부 API) 때문인지 알고 싶다"는 시나리오의 정답은 거의 항상 **X-Ray Active Tracing**이다. CloudWatch Metrics는 Lambda Duration이 길다는 것까지만 알려주지 그 안의 어느 호출이 범인인지는 못 가른다. CloudWatch Logs Insights는 로그에 직접 찍은 것만 보고, 트리 구조의 인과 관계를 자동으로 못 만든다. "다운스트림 호출까지 포함한 지연 분해"는 트레이싱 고유의 능력이다.

## SDK·데몬·ADOT — 트레이스 데이터는 어떤 경로로 X-Ray에 도달하나

애플리케이션이 트레이스를 X-Ray로 보내는 경로를 이해하면 통합 방식의 선택지가 또렷해진다. 전통적 경로는 **X-Ray SDK + X-Ray 데몬**이다. 애플리케이션이 X-Ray SDK로 계측되면, segment 데이터를 X-Ray API로 직접 보내지 않고 같은 호스트에서 도는 **X-Ray 데몬**에게 UDP로 흘려보낸다. 데몬이 이를 모아 배치로 X-Ray API에 업로드한다. 왜 굳이 데몬을 한 단계 끼울까 — 애플리케이션이 매 segment마다 X-Ray API를 동기 호출하면 응답 지연이 사용자 요청 경로에 그대로 더해진다. UDP로 로컬 데몬에 "쏘고 잊으면(fire-and-forget)" 애플리케이션은 트레이스 전송을 기다리지 않고, 데몬이 비동기로 배치 업로드하므로 본 요청의 지연에 영향을 주지 않는다.

> 💡 **관련 이론**: 이 "로컬 에이전트가 텔레메트리를 버퍼링·배치 전송한다"는 패턴은 관찰성 시스템의 공통 설계다. CloudWatch Agent, Fluent Bit, OpenTelemetry Collector, Datadog Agent가 전부 같은 구조다. 애플리케이션은 텔레메트리를 로컬에 빠르게 던지고, 사이드카/에이전트가 신뢰성 있는 전송(재시도, 배치, 압축)을 책임진다. 관심사 분리(separation of concerns)의 전형이고, 애플리케이션 코드가 네트워크 신뢰성 문제에서 해방된다.

환경마다 이 경로가 자동화되는 정도가 다르다. **Lambda**는 Active Tracing을 켜기만 하면 X-Ray 데몬에 해당하는 것이 실행 환경에 내장돼 있어 별도 설치가 필요 없다. **API Gateway·ALB**는 자체적으로 trace header를 주입·전파한다. **ECS·EKS·EC2**에서는 X-Ray 데몬을 사이드카 컨테이너나 호스트 프로세스로 직접 띄워야 한다. AWS가 미는 미래 경로는 **ADOT(AWS Distro for OpenTelemetry)**인데, 벤더 중립 표준인 OpenTelemetry를 AWS가 패키징한 배포판으로, 한 번 OTel로 계측하면 X-Ray뿐 아니라 Prometheus·Jaeger 등으로도 같은 데이터를 보낼 수 있어 락인을 줄인다.

> 🔍 **더 깊이**: X-Ray의 신형 통합인 **CloudWatch Application Signals**는 트레이싱을 한 단계 위로 끌어올린다. 기존 X-Ray가 "이 트레이스가 왜 느렸나"라는 개별 진단이라면, Application Signals는 OTel 계측에서 자동으로 SLI(지연·에러율·처리량)를 뽑아 SLO(예: "p99 지연 < 300ms를 99.9% 충족") 추적까지 해준다. 즉 트레이스라는 raw 데이터에서 서비스 수준 목표라는 경영 지표를 자동 생성한다. SAA에서 "SLO를 자동으로 추적하고 위반 시 경보"라는 최신 시나리오의 정답 신호다.

## 모든 요청을 추적하지 않는 이유 — 샘플링의 통계학

X-Ray는 기본적으로 들어오는 모든 요청을 추적하지 않는다. 기본 샘플링 규칙은 "초당 첫 1개 요청 + 그 외 요청의 5%"다. 처음 보면 인색해 보이지만, 여기엔 비용과 통계 양쪽의 합리가 있다.

비용 측면은 단순하다. 초당 수만 건을 처리하는 서비스에서 모든 요청의 전체 트레이스(각 segment의 타이밍, 메타데이터)를 저장·분석하면 그 자체가 또 하나의 거대한 데이터 파이프라인이 된다. 추적 비용이 본 서비스 비용에 맞먹는 본말전도가 일어난다.

통계 측면이 더 본질적이다. 시스템의 지연 분포·에러 패턴을 파악하는 데는 **대표 표본**이면 충분하다. 1억 건을 다 봐야 "외부 API가 p99에서 느리다"를 알 수 있는 게 아니라, 충분한 표본만 있으면 같은 결론에 도달한다. 이건 여론조사가 전 국민이 아니라 표본 수천 명으로 추세를 잡는 것과 같은 원리다. 그래서 "초당 1개 보장(reservoir)"으로 저트래픽 서비스도 최소한의 추적을 확보하고, "5% 비율(rate)"로 고트래픽에서 표본의 대표성을 유지하면서 비용을 억제한다.

> 💡 **관련 이론**: 이 "reservoir + rate" 구조는 **reservoir sampling** 알고리즘 계열의 응용이다. 핵심 통찰은 "트래픽이 적을 땐 절대 개수를 보장하고, 많을 땐 비율로 제어한다"는 이중 전략이다. 만약 5% 비율만 쓰면 초당 2건 들어오는 서비스는 평균적으로 거의 추적이 안 돼 문제 발생 시 표본이 없다. reservoir(초당 최소 보장)가 이 빈틈을 메운다. Jaeger·Zipkin도 비슷한 적응형 샘플링(adaptive sampling)을 제공하며, "꼬리 지연(tail latency)이 중요하니 느린 요청은 더 많이 샘플링하자"는 tail-based sampling이 최신 흐름이다.

> ⚠️ **함정**: "트레이스에서 특정 느린 요청이 안 보인다"는 상황을 버그로 오해하기 쉽다. 5% 샘플링이면 95%의 요청은 애초에 추적되지 않으므로, 특정 사용자의 특정 요청을 반드시 잡고 싶다면 샘플링 규칙을 조정하거나(특정 URL 경로에 FixedRate=1) 디버깅 기간 동안 비율을 올려야 한다. "모든 요청이 트레이스에 있어야 한다"는 전제 자체가 틀렸다.

## Trusted Advisor — 내가 미처 못 챙긴 모범 사례를 누가 점검하나

X-Ray가 "지금 이 요청이 왜 느린가"를 본다면, Trusted Advisor는 전혀 다른 질문에 답한다 — "내 계정 전체가 AWS 모범 사례를 따르고 있는가". 사람이 수백 개 리소스를 일일이 점검할 수 없으니, AWS가 축적한 운영 경험을 자동 점검 규칙으로 만들어 계정을 스캔해준다. 다섯 카테고리로 나뉘는 게 핵심이고, 각각이 Well-Architected Framework의 기둥과 대응한다.

| 카테고리 | 점검 예시 | 대응 WA 기둥 |
|---|---|---|
| **Cost Optimization** | 저활용 EC2, 미연결 EIP, 유휴 ELB, 미사용 RDS | 비용 최적화 |
| **Performance** | 과도한 보안 그룹 규칙, EBS 처리량 한계 근접 | 성능 효율성 |
| **Security** | MFA 미설정 루트, 0.0.0.0/0 열린 포트, 공개 S3, IAM 키 노출 | 보안 |
| **Fault Tolerance** | 단일 AZ 배치, ASG 미사용, 백업 미설정, Multi-AZ 미적용 | 신뢰성 |
| **Service Limits** | 서비스 한도(quota) 80% 이상 사용 | (운영) |

> ⚠️ **함정**: Trusted Advisor의 **무료(Basic/Developer Support)** 범위는 제한적이다 — 보안 핵심 항목 일부와 서비스 한도 점검만 무료로 제공되고, **다섯 카테고리 전체 점검과 프로그래밍 방식(API) 접근은 Business/Enterprise Support 플랜**에서만 열린다. 시험에서 "프로그래밍 방식으로 TA 점검 결과를 가져와 자동화하고 싶다"면 Business 이상이 전제다. 이 무료/유료 경계를 묻는 문제가 단골이다.

> 🔍 **더 깊이**: Trusted Advisor 점검 결과는 **EventBridge**로 흘릴 수 있어 자동화의 트리거가 된다. 예를 들어 "서비스 한도가 80%에 도달"하면 TA가 그 상태를 갱신하고, EventBridge 규칙이 이를 잡아 SNS 알림이나 Lambda 자동 대응(한도 증설 요청)을 띄운다. "수동으로 콘솔을 들여다보는 도구"가 아니라 "이벤트 소스"로 쓸 수 있다는 점이 운영 자동화에서 중요하다. 더 정교한 보안 권고가 필요하면 Security Hub, 비용 권고가 필요하면 Cost Explorer/Compute Optimizer로 역할이 갈린다.

## Health Dashboard — 내 잘못이 아닌 AWS 측 사고를 어떻게 아는가

또 하나의 결정적으로 다른 질문이 있다. "지금 내 시스템이 이상한데, 내 코드 문제인가 아니면 AWS 인프라 쪽 사고인가." 이 구분이 안 되면 엔지니어는 멀쩡한 자기 코드를 몇 시간씩 뒤지다가, 알고 보니 특정 AZ의 EBS 장애였다는 걸 뒤늦게 안다. **AWS Health Dashboard**가 이 질문에 답한다.

두 층위를 구분해야 한다. **Service Health Dashboard(현 AWS Health Dashboard - Service health)**는 모든 AWS 서비스의 전역 상태를 보여주는 공개 페이지다 — "지금 us-east-1의 S3가 정상인가"를 누구나 본다. 반면 **Personal Health Dashboard(현 Account health)**는 내 계정의 리소스에 실제로 영향을 주는 이벤트만 골라 보여준다. 전 세계 S3가 멀쩡해도 "당신이 쓰는 그 인스턴스가 도는 하드웨어가 5월 30일 02:00 UTC에 점검 재부팅됩니다" 같은 나에게만 해당하는 알림이 여기 뜬다.

> 💡 **관련 이론**: 이 구분은 모니터링 이론의 "전역 상태 vs 개인화된 영향"이다. 전역 상태 페이지는 모두에게 같은 정보(blackbox 외부 관점)이고, 개인 헬스는 내 리소스 토폴로지에 사고를 투영(personalized impact)한다. 후자가 훨씬 실행 가능(actionable)한데, 수천 개 AWS 사건 중 "나와 무관한 99%"를 걸러내고 "내가 대응해야 할 1%"만 남기기 때문이다. SRE 관점에서 "노이즈를 줄이고 신호만 남기는" 필터링의 전형이다.

> 🔍 **더 깊이**: **AWS Health API + EventBridge** 조합이 자동 대응의 핵심이다. PHD 이벤트를 EventBridge로 받으면 "내 인스턴스가 곧 재부팅 점검됨"을 감지해 사전에 트래픽을 다른 AZ로 빼거나 ASG를 미리 스케일아웃하는 자동화를 걸 수 있다. Organizations 환경에서는 **AWS Health Organizational View**로 모든 멤버 계정의 헬스 이벤트를 관리 계정에서 한 번에 본다. "예정된 AWS 측 점검에 자동 대응"이라는 시나리오의 정답은 Health API + EventBridge다 — GuardDuty(위협 탐지)·Config(구성 준수)·Trusted Advisor(모범 사례)와 명확히 구분된다.

> 📚 **사례**: 2021년 12월 7일 **AWS us-east-1 대규모 장애**는 내부 네트워크 장치의 자동 스케일링이 예상치 못한 동작을 일으켜 내부 API들이 폭주(congestion)하면서 발생했다. 이때 아이러니하게도 **Service Health Dashboard 자체가 같은 리전 인프라에 의존**해 상태 업데이트가 지연됐고, AWS는 사고 중 대시보드를 수동으로 갱신해야 했다. 이 사건 이후 AWS는 헬스 정보 경로를 사고 영향에서 더 격리하도록 개선했고, 교훈은 "모니터링 시스템은 감시 대상과 장애 도메인을 공유하면 안 된다"는 관찰성의 제1원칙이다. 자신을 감시하는 시스템이 함께 죽으면 그 순간 눈이 먼다.

## Compute Optimizer — 자원을 얼마나 크게 잡아야 하나를 ML이 답하다

마지막 도구는 "right-sizing(적정 크기 산정)" 문제를 푼다. 엔지니어는 보통 불안해서 인스턴스를 넉넉하게 잡는다 — m5.2xlarge를 띄워놓고 실제론 CPU 10%, 메모리 20%만 쓰는 식이다. 이 과잉 프로비저닝이 클라우드 낭비의 가장 큰 원천 중 하나다. **Compute Optimizer**는 CloudWatch 메트릭 이력을 ML로 분석해 "이 워크로드는 m5.large로 줄여도 되고, 그러면 월 $X를 아끼며 성능 저하는 없다"는 구체적 권장을 준다.

EC2뿐 아니라 EBS 볼륨(IOPS 과다 프로비저닝), Lambda(메모리 설정), Auto Scaling Group, ECS on Fargate까지 대상이 넓다. Trusted Advisor의 비용 점검이 "저활용 인스턴스가 있다"는 거친 신호라면, Compute Optimizer는 "정확히 어떤 타입으로 바꾸라"는 처방까지 준다는 점이 다르다.

> ⚠️ **함정**: Compute Optimizer는 **메모리 메트릭을 보려면 CloudWatch Agent가 필요**하다(Day 1의 그 메모리 문제가 여기서 다시 등장한다). Agent 없이는 CPU·네트워크 기반 권장만 나오고 메모리 기반 right-sizing의 정확도가 떨어진다. 또 권장의 품질은 관측 기간(기본 14일 이상)의 워크로드 대표성에 달려 있어, 분기 말 폭주가 있는 서비스는 그 기간을 포함해야 잘못 축소하지 않는다.

종합하면 네 도구는 서로 다른 질문에 답하는 보완 관계다. **X-Ray**는 "이 요청이 왜 느린가(내 코드/호출의 인과)", **Trusted Advisor**는 "내 환경이 모범 사례를 지키나(권고)", **Health Dashboard**는 "AWS 쪽에서 무슨 일이 났나(인프라 사고)", **Compute Optimizer**는 "자원을 얼마로 잡아야 하나(크기)". 시험은 시나리오의 질문이 이 넷 중 어디에 속하는지를 가리는 능력을 묻는다. "내 코드 = X-Ray / 환경 권고 = Trusted Advisor / AWS 측 사고 = Health / 적정 크기 = Compute Optimizer"라는 한 줄 매핑이 문제 절반을 가른다.

## CLI로 직접 만져보기

```bash
# Lambda Active Tracing 켜기 (켜는 순간 X-Ray 데몬 상당 기능이 내장 동작)
aws lambda update-function-configuration --function-name saa-fn \
  --tracing-config Mode=Active

# X-Ray 샘플링 규칙: 초당 1개 보장(reservoir) + 그 외 5%(rate)
aws xray create-sampling-rule --sampling-rule '{
  "RuleName":"default","Priority":1000,"FixedRate":0.05,
  "ReservoirSize":1,"ServiceName":"*","ServiceType":"*",
  "Host":"*","HTTPMethod":"*","URLPath":"*","Version":1
}'

# 특정 경로만 100% 추적 (디버깅 기간용 고우선순위 규칙)
aws xray create-sampling-rule --sampling-rule '{
  "RuleName":"checkout-debug","Priority":1,"FixedRate":1.0,
  "ReservoirSize":5,"ServiceName":"*","ServiceType":"*",
  "Host":"*","HTTPMethod":"POST","URLPath":"/checkout","Version":1
}'

# Trusted Advisor 점검 결과 조회 (Business+ 플랜, 엔드포인트는 us-east-1)
aws support describe-trusted-advisor-checks --language en --region us-east-1

# Compute Optimizer EC2 right-sizing 권장 (계정 옵트인 후)
aws compute-optimizer get-ec2-instance-recommendations

# Health 이벤트를 EventBridge로 받아 자동 대응하도록 규칙 생성
aws events put-rule --name aws-health-events \
  --event-pattern '{"source":["aws.health"]}'
```

## 정리하며

X-Ray는 Trace ID를 요청에 따라다니게 해 흩어진 로그를 하나의 여정으로 재구성하고, Service Map으로 "관측된 아키텍처"를 그려 병목을 짚는다. 모든 요청을 추적하지 않는 건 비용과 통계 양쪽의 합리이고, reservoir(초당 보장) + rate(비율) 구조로 저트래픽과 고트래픽을 동시에 다룬다. SDK+데몬 또는 ADOT로 데이터를 비동기 전송해 본 요청 지연에 영향을 안 주고, Application Signals로 트레이스에서 SLO까지 자동 추출한다. Trusted Advisor는 다섯 카테고리로 모범 사례를 점검하되 전체 점검·API는 Business+에서 열리고, Health Dashboard는 전역 상태(Service)와 내 계정 영향(Personal)을 구분하며 Health API+EventBridge로 AWS 측 사고에 자동 대응한다. Compute Optimizer는 ML로 right-sizing을 처방하되 메모리 정확도엔 CloudWatch Agent가 필요하다. 네 도구의 한 줄 매핑 — 내 코드는 X-Ray, 환경 권고는 Trusted Advisor, AWS 사고는 Health, 자원 크기는 Compute Optimizer — 이 시험의 뼈대다.

다음 글에서는 한 주 동안 본 관찰성·거버넌스 서비스를 "누가·언제·무엇·왜"의 네 질문으로 통합하고, 실제 시험에 나오는 형태의 시나리오 문제로 그 매핑을 굳힌다.

---

## 📝 연습 문제

**문제 1.** 한 애플리케이션이 API Gateway → Lambda → DynamoDB → 외부 결제 API 순으로 요청을 처리하는데, 사용자가 체감하는 응답이 3초로 느리다. CloudWatch Metrics에서는 Lambda Duration이 길다는 것만 보이고, 어느 다운스트림 호출이 병목인지 분해되지 않는다. 가장 적절한 도구는?

A) CloudWatch Logs Insights로 로그를 풀스캔한다
B) X-Ray Active Tracing을 켜서 Segment/Subsegment로 호출별 지연을 분해한다
C) Trusted Advisor의 Performance 점검을 실행한다
D) Compute Optimizer로 Lambda 메모리를 늘린다

**정답: B**

해설: "다운스트림 호출까지 포함한 지연을 호출 단위로 분해"하는 것은 분산 트레이싱 고유의 능력이다. X-Ray는 Lambda Segment 안에서 DynamoDB·외부 API를 각각 Subsegment로 쪼개 어느 구간이 2.8초를 잡아먹는지 보여준다. A의 Logs Insights는 로그에 직접 찍은 것만 보고 트리 형태의 인과 관계를 자동 생성하지 못한다. C의 Trusted Advisor는 모범 사례 점검이지 런타임 지연 진단이 아니다. D의 Compute Optimizer는 right-sizing 도구로, 원인이 외부 API라면 메모리를 늘려도 무의미하다. 추가로, X-Ray는 첫 진입점에서 발급한 Trace ID를 `X-Amzn-Trace-Id` 헤더로 전파해 서비스 경계를 넘어 같은 트레이스로 묶는다는 점을 기억하면 통합 범위를 이해하기 쉽다.

---

**문제 2.** 한 팀이 X-Ray 기본 샘플링(초당 1 + 5%)을 쓰는데, 특정 사용자가 신고한 느린 요청이 트레이스에 보이지 않는다. 가장 정확한 설명과 대응은?

A) X-Ray 버그이므로 데몬을 재시작한다
B) 5% 샘플링이면 대부분 요청은 추적되지 않으므로 정상이며, 해당 경로에 FixedRate를 높인 규칙을 추가한다
C) CloudWatch Agent가 없어서이며 Agent를 설치한다
D) Lambda Active Tracing이 꺼져 있어서이므로 켠다

**정답: B**

해설: 기본 샘플링은 비용·통계 양쪽 이유로 모든 요청을 추적하지 않는다. 5% 비율이면 95%는 애초에 추적 대상이 아니므로 특정 요청이 안 보이는 건 버그가 아니다. 디버깅 시에는 해당 URL 경로에 우선순위 높은 규칙(FixedRate=1.0)을 추가해 그 경로만 100% 추적하면 된다. A는 잘못된 진단이다. C의 메모리 메트릭 문제는 샘플링과 무관하다. D는 이미 트레이스 일부가 보이므로(샘플된 5%) Active Tracing은 켜져 있다는 뜻이라 원인이 아니다. reservoir(초당 1 보장)는 저트래픽 서비스가 최소 추적을 확보하게 하고, rate(5%)는 고트래픽 비용을 억제하는 이중 전략임을 함께 기억하면 좋다.

---

**문제 3.** 보안팀이 프로그래밍 방식(API)으로 매일 계정의 "0.0.0.0/0로 열린 포트, MFA 미설정 루트, 공개 S3" 같은 모범 사례 위반을 자동 수집해 대시보드에 올리려 한다. 전제 조건과 도구로 옳은 것은?

A) 무료 Basic Support에서 Trusted Advisor API를 호출한다
B) Business 또는 Enterprise Support 플랜에서 Trusted Advisor 전체 점검 + API를 사용한다
C) Health Dashboard API를 사용한다
D) Compute Optimizer API를 사용한다

**정답: B**

해설: Trusted Advisor의 다섯 카테고리 전체 점검과 프로그래밍 방식(API) 접근은 Business/Enterprise Support 플랜에서만 열린다. 무료 범위는 보안 핵심 일부와 서비스 한도 점검으로 제한되며 API 자동화에 부적합하다(A 오답). C의 Health Dashboard는 AWS 측 인프라 사고를 보는 도구이지 내 계정의 모범 사례 위반 점검이 아니다. D의 Compute Optimizer는 right-sizing 전용이다. 더 정교하고 지속적인 보안 태세 관리가 필요하면 Security Hub로 확장하는 것이 다음 단계다.

---

**문제 4.** 운영팀이 "내 계정 리소스에 실제로 영향을 주는 AWS 측 예정 점검·장애에 자동으로 대응(트래픽을 다른 AZ로 이동)"하려 한다. 가장 적절한 구성은?

A) Service Health Dashboard 공개 페이지를 주기적으로 새로고침한다
B) GuardDuty 알림을 EventBridge로 받는다
C) AWS Health API(Personal Health) 이벤트를 EventBridge로 받아 Lambda 자동 대응을 트리거한다
D) Config Rule 위반을 SSM Automation으로 교정한다

**정답: C**

해설: 내 계정에 영향을 주는 AWS 측 이벤트는 Personal Health(Account health)의 영역이고, Health API + EventBridge로 받으면 "내 인스턴스가 곧 점검 재부팅됨" 같은 신호에 자동 대응을 걸 수 있다. A는 전역 공개 페이지라 내 리소스에 개인화된 영향을 주지 않고 자동화에도 부적합하다. B의 GuardDuty는 위협 탐지이지 AWS 인프라 점검 이벤트가 아니다. D의 Config는 내 리소스 구성 준수 문제이지 AWS 측 사고가 아니다. 2021년 us-east-1 장애에서 Service Health Dashboard 자체가 같은 인프라에 의존해 갱신이 지연됐던 사례는 "개인화된 Health 신호"의 가치를 잘 보여준다.

---

**문제 5.** 비용 검토에서 m5.2xlarge 인스턴스 50대가 평균 CPU 12%, 메모리 18%로 과잉 프로비저닝됐음이 드러났다. "정확히 어떤 인스턴스 타입으로 줄여야 비용을 아끼면서 성능 저하가 없는지"까지 처방받고 싶다. 또한 메모리 기반 권장의 정확도를 높이려면?

A) Trusted Advisor Cost 점검만으로 충분하다
B) Compute Optimizer를 쓰되, 정확한 메모리 기반 권장을 위해 CloudWatch Agent를 설치한다
C) X-Ray로 right-sizing한다
D) Health Dashboard로 인스턴스 크기를 본다

**정답: B**

해설: Trusted Advisor의 비용 점검은 "저활용 인스턴스가 있다"는 거친 신호까지만 주고(A는 처방이 부족), Compute Optimizer가 ML로 "이 타입으로 바꾸면 월 $X 절감, 성능 저하 없음"이라는 구체적 처방을 준다. 단, 메모리 메트릭은 게스트 OS 내부 정보라 CloudWatch Agent 없이는 수집되지 않아 메모리 기반 right-sizing 정확도가 떨어진다(Day 1의 메모리 메트릭 함정과 같은 원리). C의 X-Ray는 지연 진단 도구이지 자원 크기 산정이 아니다. D는 무관하다. 관측 기간이 워크로드를 대표해야(분기 말 폭주 포함) 잘못된 축소를 피한다는 점도 실무 포인트다.

---

**문제 6.** 한 SaaS가 ECS on Fargate로 마이크로서비스를 운영하며, 벤더 종속 없이 표준 방식으로 트레이싱을 계측하고 향후 X-Ray뿐 아니라 Prometheus/Jaeger로도 같은 데이터를 보낼 여지를 남기고 싶다. 가장 적절한 접근은?

A) X-Ray SDK로만 직접 계측한다
B) ADOT(AWS Distro for OpenTelemetry)로 OTel 표준 계측을 하고 X-Ray로 내보낸다
C) CloudWatch Agent만 설치한다
D) Lambda Active Tracing을 켠다

**정답: B**

해설: 벤더 중립성과 이식성을 원하면 OpenTelemetry 표준이 정답이고, ADOT는 이를 AWS가 패키징한 배포판이다. 한 번 OTel로 계측하면 백엔드(X-Ray, Prometheus, Jaeger 등)를 바꿔 끼울 수 있어 락인을 줄인다. A의 X-Ray SDK 전용 계측은 AWS 종속이 강하다. C의 CloudWatch Agent는 메트릭/로그 수집이지 분산 트레이싱 계측 표준이 아니다. D는 Fargate가 아니라 Lambda 한정 기능이다. ECS/EKS에서는 데몬이나 Collector를 사이드카로 띄워야 한다는 점도 함께 기억하면 통합 구조가 정리된다.

---

**문제 7.** 운영팀이 X-Ray로 수집된 트레이스에서 자동으로 SLI(지연·에러율·처리량)를 뽑아 SLO("p99 < 300ms를 99.9% 충족")를 추적하고 위반 시 경보하고 싶다. 별도 대시보드를 손으로 만들지 않고 관리형으로 처리하려면?

A) CloudWatch Composite Alarm을 수동 조합한다
B) CloudWatch Application Signals를 사용한다
C) Trusted Advisor Performance 점검을 본다
D) Logs Insights 쿼리를 스케줄링한다

**정답: B**

해설: CloudWatch Application Signals는 OTel/X-Ray 계측에서 자동으로 SLI를 추출하고 SLO 추적·경보까지 관리형으로 제공해, 트레이스라는 raw 데이터에서 서비스 수준 목표라는 상위 지표를 자동 생성한다. A는 수동 임계값 조합이라 SLO의 "달성 비율(99.9%)" 개념을 직접 구현해야 해 번거롭다. C는 모범 사례 점검이지 SLO 추적이 아니다. D는 로그 쿼리로 가능은 하나 SLO 관리형 추적과 거리가 멀고 손이 많이 간다. "SLO 자동 추적"이라는 최신 시나리오의 정답 신호가 Application Signals임을 기억하자.

---

해설 보강: 네 도구는 "질문의 종류"로 구분한다. 런타임 인과(왜 느린가)는 X-Ray, 모범 사례 준수는 Trusted Advisor(전체·API는 Business+), AWS 사고의 내 계정 영향은 Health(Personal)+EventBridge, 자원 크기는 Compute Optimizer(메모리엔 Agent)다. X-Ray는 Trace ID 전파·Segment/Subsegment 트리·reservoir+rate 샘플링·Service Map이, 그리고 Application Signals(SLO)·ADOT(표준 계측)가 최신 출제 포인트다.
